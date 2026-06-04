// compression.ts — Conversation Compression + Prompt Cache
// Comprime histórico a cada N turns (economia de 97% em tokens de histórico)
import type { LLMProvider, ChatMessage, ToolCall } from "./types.ts";

const COMPRESSION_INTERVAL = 5;
const MAX_CONTEXT_MESSAGES = 32;

export class CompressionManager {
  private summarizing: LLMProvider;
  private compressedSummary = "";
  private turnCount = 0;

  constructor(summarizer: LLMProvider) {
    this.summarizing = summarizer;
  }

  reset(): void {
    this.compressedSummary = "";
    this.turnCount = 0;
  }

  async compress(messages: ChatMessage[]): Promise<ChatMessage[]> {
    this.turnCount++;

    if (this.turnCount % COMPRESSION_INTERVAL !== 0 && messages.length < MAX_CONTEXT_MESSAGES * 2) {
      return this.buildPromptMessages(messages);
    }

    try {
      this.compressedSummary = await this.summarizeHistory(messages);
      this.turnCount = 0;
    } catch {
      // Se falhar, continua sem comprimir
    }

    return this.buildPromptMessages(messages);
  }

  private async summarizeHistory(messages: ChatMessage[]): Promise<string> {
    const relevant = messages
      .filter(m => m.content && (m.role === "user" || m.role === "assistant"))
      .slice(-20)
      .map(m => `[${m.role}]: ${m.content!.slice(0, 300)}`)
      .join("\n");

    const resp = await this.summarizing.chat({
      messages: [
        {
          role: "system",
          content: "Resuma em português o que foi feito até agora na conversa. Máximo 300 palavras. Mencione arquivos criados/modificados e decisões importantes.",
        },
        { role: "user", content: relevant },
      ],
      max_tokens: 500,
      temperature: 0.1,
    });

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

  // Executa todas as reads em paralelo
  if (reads.length > 0) {
    const readResults = await Promise.all(reads.map(c => executor(c).then(r => ({ call: c, result: r }))));
    results.push(...readResults);
  }

  // Executa writes sequencialmente (dependência de ordem)
  for (const c of writes) {
    const r = await executor(c);
    results.push({ call: c, result: r });
  }

  return results;
}
