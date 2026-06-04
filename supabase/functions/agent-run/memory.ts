import type { ChatMessage } from "./types.ts";

type HistoryRow = {
  role: string;
  parts?: Array<{ type?: string; text?: string }>;
  tool_calls?: Array<{
    id?: string;
    name?: string;
    args?: unknown;
    status?: string;
    error?: string | null;
    artifacts?: unknown[];
  }>;
  created_at?: string;
};

/** Reconstrói histórico completo para o LLM (assistant + tool results). */
export function buildChatHistory(rows: HistoryRow[], maxRows = 120): ChatMessage[] {
  const slice = rows.slice(-maxRows);
  const out: ChatMessage[] = [];

  for (const m of slice) {
    const text = (m.parts ?? [])
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n");

    if (m.role === "assistant" && (m.tool_calls?.length ?? 0) > 0) {
      out.push({
        role: "assistant",
        content: text || "",
        tool_calls: (m.tool_calls ?? []).map((tc) => ({
          id: tc.id ?? crypto.randomUUID(),
          type: "function" as const,
          function: {
            name: tc.name ?? "",
            arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}),
          },
        })),
      });

      for (const tc of m.tool_calls ?? []) {
        if (!tc.id) continue;
        const payload = {
          ok: tc.status === "ok",
          status: tc.status ?? "unknown",
          error: tc.error ?? null,
          artifacts: tc.artifacts ?? [],
        };
        out.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(payload).slice(0, 4000),
        });
      }
      continue;
    }

    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: "",
        content: text,
      });
      continue;
    }

    if (m.role === "user" || m.role === "assistant" || m.role === "system") {
      out.push({
        role: m.role as ChatMessage["role"],
        content: text || "",
      });
    }
  }

  return out;
}