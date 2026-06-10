// compression.ts — Conversation Compression + token-aware context (C17)
import type { LLMProvider, ChatMessage, ToolCall, ChatResponse } from "./types.ts";
import {
  estimateMessageTokens,
  INPUT_TOKEN_FORCE,
  INPUT_TOKEN_WARN,
  normalizeChatUsage,
} from "./token-usage.ts";

const COMPRESSION_INTERVAL = 5;
const MAX_CONTEXT_MESSAGES = 64;

export type CompressionNotify = (type: string, data: Record<string, unknown>) => void;

export class CompressionManager {
  private summarizing: LLMProvider;
  private compressedSummary = "";
  private turnCount = 0;
  private lastInputTokens = 0;
  private lastEstimatedTokens = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private onNotify: CompressionNotify | null;

  constructor(summarizer: LLMProvider, onNotify: CompressionNotify | null = null) {
    this.summarizing = summarizer;
    this.onNotify = onNotify;
  }

  reset(): void {
    this.compressedSummary = "";
    this.turnCount = 0;
    this.lastInputTokens = 0;
    this.lastEstimatedTokens = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
  }

  /** Custo estimado em USD por 1M tokens (input/output separados). Espelha agent-progress MODEL_COSTS. */
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

  /** Registra usage.input_tokens da última chamada LLM (C17) + acumula totais. */
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

  /** Total de tokens consumidos nesta run (input + output). */
  getTotalTokens(): { input: number; output: number; total: number } {
    return {
      input: this.totalInputTokens,
      output: this.totalOutputTokens,
      total: this.totalInputTokens + this.totalOutputTokens,
    };
  }

  /** Custo estimado em USD baseado no modelo principal. */
  getEstimatedCostUsd(model: string | null): number {
    const costs = CompressionManager.MODEL_COSTS[model ?? "default"] ?? CompressionManager.MODEL_COSTS.default;
    const inCost = (this.totalInputTokens / 1_000_000) * costs.input;
    const outCost = (this.totalOutputTokens / 1_000_000) * costs.output;
    return Number((inCost + outCost).toFixed(6));
  }

  async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    this.turnCount++;
    this.lastEstimatedTokens = estimateMessageTokens(messages);

    const effectiveTokens = Math.max(this.lastInputTokens, this.lastEstimatedTokens);
    const pressure = effectiveTokens >= INPUT_TOKEN_WARN;
    const force = effectiveTokens >= INPUT_TOKEN_FORCE;

    if (pressure && this.onNotify) {
      this.onNotify("context_pressure", {
        message: `Contexto grande (~${effectiveTokens.toLocaleString()} tokens). ${
          force ? "Comprimindo histórico agora…" : "Monitorando uso de contexto…"
        }`,
        inputTokens: this.lastInputTokens,
        estimatedTokens: this.lastEstimatedTokens,
        effectiveTokens,
      });
    }

    const intervalHit = this.turnCount % COMPRESSION_INTERVAL === 0;
    const messageOverflow = messages.length >= MAX_CONTEXT_MESSAGES * 2;
    const shouldSummarize = force || intervalHit || messageOverflow;

    if (shouldSummarize) {
      try {
        const prev = this.compressedSummary;
        this.compressedSummary = await this.summarizeHistory(messages);
        this.turnCount = 0;

        if (this.onNotify && (force || this.compressedSummary !== prev)) {
          this.onNotify("context_compress", {
            message: force
              ? `Histórico resumido após ${effectiveTokens.toLocaleString()} tokens de entrada`
              : "Histórico resumido para economizar contexto",
            reason: force ? "input_tokens" : intervalHit ? "interval" : "message_count",
            inputTokens: this.lastInputTokens,
            estimatedTokens: this.lastEstimatedTokens,
          });
        }
      } catch {
        // Se falhar, continua sem comprimir
      }
    }

    return this.buildPromptMessages(messages);
  }

  private async summarizeHistory(messages: ChatMessage[]): Promise<string> {
    const relevant = messages
      .filter(m => m.content && (m.role === "user" || m.role === "assistant"))
      .slice(-20)
      .map(m => `[${m.role}]: ${String(m.content).slice(0, 300)}`)
      .join("\n");

    const prevSummary = this.compressedSummary;
    const prompt = prevSummary
      ? `Resumo anterior:\n${prevSummary}\n\nNovas mensagens desde o último resumo:\n${relevant}\n\nAtualize o resumo incorporando as novas mensagens. Máximo 300 palavras. Preserve nomes de arquivos e decisões arquiteturais críticas.`
      : `Resuma em português o que foi feito até agora na conversa. Máximo 300 palavras. Mencione arquivos criados/modificados e decisões importantes.`;

    const resp = await this.summarizing.chat({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: relevant },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });

    this.recordUsage(resp.usage);
    return resp.content ?? this.compressedSummary;
  }

  buildPromptMessages(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];

    if (this.compressedSummary) {
      result.push({
        role: "system",
        content: `## Resumo da Conversa Anterior\n${this.compressedSummary}\n\nContinue de onde parou.`,
      });
    }

    const recent = messages.slice(-MAX_CONTEXT_MESSAGES);
    for (const m of recent) {
      const trimmed = typeof m.content === "string" && m.content.length > 6000
        ? { ...m, content: m.content.slice(0, 6000) + "\n... [truncado]" }
        : m;
      result.push(trimmed);
    }

    return result;
  }
}

export function buildCachedMessages(
  systemPrompt: string,
  toolDefs: unknown[],
  contextBlock: string,
  instruction: string,
  history: ChatMessage[],
): { system: ChatMessage[]; messages: ChatMessage[] } {
  const system: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `## Ferramentas Disponíveis\n${JSON.stringify(toolDefs.map((t: any) => ({ name: t.name, description: t.description })))}` },
    { role: "system", content: contextBlock },
  ];

  return {
    system,
    messages: [
      ...history.filter(m => m.role === "user" || m.role === "assistant" || m.role === "tool"),
      { role: "user", content: instruction },
    ],
  };
}

export async function parallelExecute(
  calls: ToolCall[],
  executor: (call: ToolCall) => Promise<{ toolCallId: string; ok: boolean; output: unknown; error?: string }>,
): Promise<Array<{ call: ToolCall; result: { ok: boolean; output: unknown; error?: string } }>> {
  const reads = calls.filter(c => c.name === "fs_read" || c.name === "fs_read_many" || c.name === "fs_list" || c.name === "fs_search");
  const writes = calls.filter(c => !reads.includes(c));

  const results: Array<{ call: ToolCall; result: { ok: boolean; output: unknown; error?: string } }> = [];

  if (reads.length > 0) {
    const readResults = await Promise.all(reads.map(c => executor(c).then(r => ({ call: c, result: r }))));
    results.push(...readResults);
  }

  for (const c of writes) {
    const r = await executor(c);
    results.push({ call: c, result: r });
  }

  return results;
}