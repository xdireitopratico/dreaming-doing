import type { ChatMessage } from "./types.ts";
import {
  type DbMessagePart,
  expandPartsToOpenAIContent,
  modelIdSupportsVision,
} from "../_shared/message-parts.ts";

type HistoryRow = {
  role: string;
  parts?: DbMessagePart[];
  tool_calls?: Array<{
    id?: string;
    name?: string;
    args?: unknown;
    status?: string;
    error?: string | null;
    artifacts?: unknown[];
  }>;
  created_at?: string;
  meta?: Record<string, unknown> | null;
};

/** Reconstrói histórico completo para o LLM (assistant + tool results + anexos). */
export async function buildChatHistory(
  rows: HistoryRow[],
  maxRows = 120,
  modelHint = "",
): Promise<ChatMessage[]> {
  const slice = rows.slice(-maxRows);
  const out: ChatMessage[] = [];

  for (const m of slice) {
    const plainText = (m.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n");

    if (m.role === "assistant" && (m.tool_calls?.length ?? 0) > 0) {
      // Gera IDs estáveis para tool calls (evita mismatch entre assistant e tool results)
      const toolCallsWithIds = (m.tool_calls ?? []).map((tc, idx) => {
        const stableId = tc.id || `tc-${m.created_at ?? idx}-${idx}`;
        return { ...tc, id: stableId };
      });

      out.push({
        role: "assistant",
        content: plainText || "",
        tool_calls: toolCallsWithIds.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name ?? "",
            arguments: typeof tc.args === "string"
              ? tc.args
              : JSON.stringify(tc.args ?? {}),
          },
        })),
      });

      for (const tc of toolCallsWithIds) {
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
        content: plainText,
      });
      continue;
    }

    if (m.role === "user") {
      const hasRichParts = (m.parts ?? []).some(
        (p) => p.type === "image" || p.type === "file_blob",
      );
      const visionCapable = modelIdSupportsVision(modelHint);
      const content = hasRichParts
        ? await expandPartsToOpenAIContent(m.parts, {
          visionCapable,
          modelHint,
        })
        : plainText || "";
      const userMsg: ChatMessage = { role: "user", content: content || "" };
      if (m.meta) userMsg.meta = m.meta;
      out.push(userMsg);
      continue;
    }

    if (m.role === "assistant" || m.role === "system") {
      out.push({
        role: m.role as ChatMessage["role"],
        content: plainText || "",
      });
    }
  }

  return out;
}
