// compression.ts — Session context window (rewrite C17)
import type { LLMProvider, ChatMessage, ToolCall, ChatResponse, ToolResult } from "./types.ts";
import {
  estimateMessageTokens,
  normalizeChatUsage,
} from "./token-usage.ts";

export type ContextWindowMode = "manual" | "auto";

export type ContextWindowPolicy = {
  mode: ContextWindowMode;
  windowTokens: number;
};

// Default só entra quando a preferência do usuário não trouxe janela nenhuma.
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 256;
export const AUTO_ADVISORY_RATIO = 0.8;
export const AUTO_FORCE_RATIO = 0.95;
const MAX_ANCHOR_MESSAGES = 64;

export type SessionMemory = {
  mission: string;
  files: string[];
  decisions: string[];
  learnings: string[];
  open_tasks: string[];
  design_snapshot?: string;
};

export type ContextUsageSnapshot = {
  usageTokens: number;
  windowTokens: number;
  percent: number;
  source: "provider" | "estimate";
};

export type SessionContextNotify = (type: string, data: Record<string, unknown>) => void;

export type CompactContext = {
  mission?: string;
  designSnapshot?: string;
};

function normalizePolicy(raw?: Partial<ContextWindowPolicy> | null): ContextWindowPolicy {
  const mode = raw?.mode === "auto" ? "auto" : "manual";
  const windowTokens =
    typeof raw?.windowTokens === "number" && raw.windowTokens > 0
      ? Math.floor(raw.windowTokens)
      : DEFAULT_CONTEXT_WINDOW_TOKENS;
  return { mode, windowTokens };
}

export class SessionContextManager {
  private summarizer: LLMProvider;
  private policy: ContextWindowPolicy;
  private sessionMemory: SessionMemory | null = null;
  private lastInputTokens = 0;
  private lastEstimatedTokens = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private compactRequested = false;
  private advisoryInjected = false;
  private compacting = false;
  private onNotify: SessionContextNotify | null;

  constructor(
    summarizer: LLMProvider,
    policy?: Partial<ContextWindowPolicy> | null,
    onNotify: SessionContextNotify | null = null,
  ) {
    this.summarizer = summarizer;
    this.policy = normalizePolicy(policy);
    this.onNotify = onNotify;
  }

  setPolicy(policy?: Partial<ContextWindowPolicy> | null): void {
    this.policy = normalizePolicy(policy);
  }

  getPolicy(): ContextWindowPolicy {
    return this.policy;
  }

  reset(): void {
    this.sessionMemory = null;
    this.lastInputTokens = 0;
    this.lastEstimatedTokens = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.compactRequested = false;
    this.advisoryInjected = false;
    this.compacting = false;
  }

  requestCompact(): void {
    this.compactRequested = true;
  }

  isCompacting(): boolean {
    return this.compacting;
  }

  private static readonly MODEL_COSTS: Record<string, { input: number; output: number }> = {
    "claude-sonnet-4-20250514": { input: 3, output: 15 },
    "claude-opus-4-20250514": { input: 15, output: 75 },
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4.1": { input: 2, output: 8 },
    "grok-3": { input: 3, output: 15 },
    "grok-3-mini": { input: 0.3, output: 0.5 },
    "gemini-2.5-pro": { input: 1.25, output: 10 },
    "gemini-2.5-flash": { input: 0.15, output: 0.6 },
    "llama-3.3-70b-versatile": { input: 0, output: 0 },
    "meta/llama-3.3-70b-instruct": { input: 0, output: 0 },
    default: { input: 1, output: 3 },
  };

  recordUsage(usage: ChatResponse["usage"] | undefined): void {
    const normalized = normalizeChatUsage(usage);
    if (normalized) {
      this.lastInputTokens = normalized.input_tokens;
      this.totalInputTokens += normalized.input_tokens;
      this.totalOutputTokens += normalized.output_tokens;
    }
  }

  getLastInputTokens(): number {
    return this.lastInputTokens;
  }

  getTotalTokens(): { input: number; output: number; total: number } {
    return {
      input: this.totalInputTokens,
      output: this.totalOutputTokens,
      total: this.totalInputTokens + this.totalOutputTokens,
    };
  }

  getEstimatedCostUsd(model: string | null): number {
    const costs =
      SessionContextManager.MODEL_COSTS[model ?? "default"] ??
      SessionContextManager.MODEL_COSTS.default;
    const inCost = (this.totalInputTokens / 1_000_000) * costs.input;
    const outCost = (this.totalOutputTokens / 1_000_000) * costs.output;
    return Number((inCost + outCost).toFixed(6));
  }

  measure(messages: ChatMessage[]): ContextUsageSnapshot {
    this.lastEstimatedTokens = estimateMessageTokens(messages);
    const usageTokens = Math.max(this.lastInputTokens, this.lastEstimatedTokens);
    const windowTokens = this.policy.windowTokens;
    const percent = windowTokens > 0 ? Math.min(100, (usageTokens / windowTokens) * 100) : 0;
    return {
      usageTokens,
      windowTokens,
      percent,
      source: this.lastInputTokens > 0 ? "provider" : "estimate",
    };
  }

  emitUsage(messages: ChatMessage[]): void {
    const snap = this.measure(messages);
    this.onNotify?.("context_usage", {
      usageTokens: snap.usageTokens,
      windowTokens: snap.windowTokens,
      percent: Math.round(snap.percent * 10) / 10,
      mode: this.policy.mode,
      compacting: this.compacting,
      source: snap.source,
    });
  }

  shouldInjectAdvisory(messages: ChatMessage[]): boolean {
    if (this.policy.mode !== "auto" || this.advisoryInjected) return false;
    const snap = this.measure(messages);
    return snap.percent >= AUTO_ADVISORY_RATIO * 100;
  }

  markAdvisoryInjected(): void {
    this.advisoryInjected = true;
  }

  buildAdvisoryMessage(): string {
    return (
      "Você está em ~80% da janela de contexto configurada. " +
      "Se puder, chame `session_compact` agora para preservar decisões e arquivos importantes. " +
      "Se precisar de mais um ciclo de ferramentas, termine esse ciclo e compacte em seguida."
    );
  }

  shouldRunCompact(messages: ChatMessage[]): boolean {
    if (this.compactRequested) return true;
    if (this.policy.mode !== "auto") return false;
    const snap = this.measure(messages);
    return snap.percent >= AUTO_FORCE_RATIO * 100;
  }

  clearCompactRequest(): void {
    this.compactRequested = false;
  }

  prepareMessages(messages: ChatMessage[]): ChatMessage[] {
    return this.buildPromptMessages(messages);
  }

  async runCompact(
    messages: ChatMessage[],
    context: CompactContext = {},
  ): Promise<{ messages: ChatMessage[]; beforeTokens: number; afterTokens: number }> {
    const before = this.measure(messages);
    this.compacting = true;
    this.emitUsage(messages);

    try {
      const memory = await this.summarizeToSessionMemory(messages, context);
      this.sessionMemory = memory;
      const rebuilt = this.rebuildHistoryAfterCompact(messages, memory);
      const after = this.measure(rebuilt);

      this.onNotify?.("context_compact_done", {
        beforeTokens: before.usageTokens,
        afterTokens: after.usageTokens,
        percentBefore: Math.round(before.percent * 10) / 10,
        percentAfter: Math.round(after.percent * 10) / 10,
        windowTokens: this.policy.windowTokens,
      });

      this.advisoryInjected = false;
      this.clearCompactRequest();
      return { messages: rebuilt, beforeTokens: before.usageTokens, afterTokens: after.usageTokens };
    } finally {
      this.compacting = false;
    }
  }

  private async summarizeToSessionMemory(
    messages: ChatMessage[],
    context: CompactContext,
  ): Promise<SessionMemory> {
    const transcript = this.formatTranscriptForCompact(messages);
    const prev = this.sessionMemory;
    const prompt = [
      "Analise o histórico da sessão e produza JSON estruturado com a memória persistente.",
      "Preserve nomes de arquivos, decisões arquiteturais, aprendizados e tarefas em aberto.",
      "Responda APENAS com JSON válido no formato:",
      '{"mission":"","files":[],"decisions":[],"learnings":[],"open_tasks":[],"design_snapshot":""}',
      context.mission ? `Missão do usuário: ${context.mission}` : "",
      context.designSnapshot ? `Design atual:\n${context.designSnapshot}` : "",
      prev ? `Memória anterior:\n${JSON.stringify(prev)}` : "",
      `Histórico:\n${transcript}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const resp = await this.summarizer.chat({
      messages: [
        {
          role: "system",
          content:
            "Você compacta sessões de agente de código. Saída: JSON SessionMemory, sem markdown.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
      temperature: 0.1,
    });

    this.recordUsage(resp.usage);
    return this.parseSessionMemory(resp.content ?? "", prev);
  }

  private parseSessionMemory(raw: string, fallback: SessionMemory | null): SessionMemory {
    const trimmed = raw.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const asStrings = (v: unknown) =>
          Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
        return {
          mission: typeof parsed.mission === "string" ? parsed.mission : fallback?.mission ?? "",
          files: asStrings(parsed.files),
          decisions: asStrings(parsed.decisions),
          learnings: asStrings(parsed.learnings),
          open_tasks: asStrings(parsed.open_tasks),
          design_snapshot:
            typeof parsed.design_snapshot === "string"
              ? parsed.design_snapshot
              : fallback?.design_snapshot,
        };
      } catch {
        // fall through
      }
    }
    return (
      fallback ?? {
        mission: "",
        files: [],
        decisions: [],
        learnings: [],
        open_tasks: [],
      }
    );
  }

  private formatTranscriptForCompact(messages: ChatMessage[]): string {
    const lines: string[] = [];
    for (const m of messages) {
      if (m.role === "tool") {
        const preview = typeof m.content === "string" ? m.content.slice(0, 400) : "";
        lines.push(`[tool]: ${preview}`);
        continue;
      }
      if (!m.content && !(m.tool_calls?.length)) continue;
      const content =
        typeof m.content === "string"
          ? m.content.slice(0, 800)
          : JSON.stringify(m.content).slice(0, 800);
      const tools = m.tool_calls?.length
        ? ` tool_calls=${m.tool_calls.map((t) => t.function?.name ?? "?").join(",")}`
        : "";
      lines.push(`[${m.role}]${tools}: ${content}`);
    }
    return lines.slice(-80).join("\n");
  }

  private formatSessionMemoryBlock(memory: SessionMemory): string {
    const sections = [
      `## Missão\n${memory.mission || "(não definida)"}`,
      memory.files.length ? `## Arquivos\n${memory.files.map((f) => `- ${f}`).join("\n")}` : "",
      memory.decisions.length
        ? `## Decisões\n${memory.decisions.map((d) => `- ${d}`).join("\n")}`
        : "",
      memory.learnings.length
        ? `## Aprendizados\n${memory.learnings.map((l) => `- ${l}`).join("\n")}`
        : "",
      memory.open_tasks.length
        ? `## Tarefas em aberto\n${memory.open_tasks.map((t) => `- ${t}`).join("\n")}`
        : "",
      memory.design_snapshot ? `## Design\n${memory.design_snapshot}` : "",
    ].filter(Boolean);
    return `## Memória da Sessão (compactada)\n${sections.join("\n\n")}\n\nContinue de onde parou.`;
  }

  private rebuildHistoryAfterCompact(
    messages: ChatMessage[],
    memory: SessionMemory,
  ): ChatMessage[] {
    const anchor = this.sliceAnchorBlock(messages);
    return [
      { role: "system", content: this.formatSessionMemoryBlock(memory) },
      ...anchor,
    ];
  }

  private sliceAnchorBlock(messages: ChatMessage[]): ChatMessage[] {
    const lastAssistantWithTools = [...messages]
      .reverse()
      .findIndex((m) => m.role === "assistant" && (m.tool_calls?.length ?? 0) > 0);
    const anchorIdx =
      lastAssistantWithTools === -1 ? -1 : messages.length - 1 - lastAssistantWithTools;
    const safeEnd = anchorIdx === -1 ? messages.length : Math.min(messages.length, anchorIdx + 4);
    const startFrom = Math.max(0, safeEnd - MAX_ANCHOR_MESSAGES);
    return messages.slice(startFrom, safeEnd).map((m) => {
      if (typeof m.content === "string" && m.content.length > 6000) {
        return { ...m, content: m.content.slice(0, 6000) + "\n... [truncado]" };
      }
      return m;
    });
  }

  buildPromptMessages(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    if (this.sessionMemory) {
      result.push({
        role: "system",
        content: this.formatSessionMemoryBlock(this.sessionMemory),
      });
    }
    result.push(...this.sliceAnchorBlock(messages));
    return result;
  }
}

/** @deprecated Use SessionContextManager */
export type CompressionManager = SessionContextManager;

export function buildCachedMessages(
  systemPrompt: string,
  toolDefs: unknown[],
  contextBlock: string,
  instruction: string,
  history: ChatMessage[],
): { system: ChatMessage[]; messages: ChatMessage[] } {
  const system: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `## Ferramentas Disponíveis\n${JSON.stringify(toolDefs.map((t: any) => ({ name: t.name, description: t.description })))}`,
    },
    { role: "system", content: contextBlock },
  ];

  return {
    system,
    messages: [
      ...history.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool"),
      { role: "user", content: instruction },
    ],
  };
}

export async function parallelExecute(
  calls: ToolCall[],
  executor: (call: ToolCall) => Promise<ToolResult>,
): Promise<Array<{ call: ToolCall; result: ToolResult }>> {
  const reads = calls.filter(
    (c) =>
      c.name === "fs_read" ||
      c.name === "fs_read_many" ||
      c.name === "fs_list" ||
      c.name === "fs_search",
  );
  const writes = calls.filter((c) => !reads.includes(c));

  const results: Array<{ call: ToolCall; result: ToolResult }> = [];

  if (reads.length > 0) {
    const readResults = await Promise.all(
      reads.map((c) => executor(c).then((r) => ({ call: c, result: r }))),
    );
    results.push(...readResults);
  }

  for (const c of writes) {
    const r = await executor(c);
    results.push({ call: c, result: r });
  }

  return results;
}
