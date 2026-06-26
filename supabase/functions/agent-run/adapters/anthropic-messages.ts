import type { ChatMessage } from "../types.ts";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

function asText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  return JSON.stringify(content);
}

/** Anthropic não aceita role `tool` — converte para blocos tool_result em mensagens user. */
export function normalizeMessagesForAnthropic(messages: ChatMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") continue;

    if (m.role === "tool") {
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: asText(m.content),
      };
      const prev = out[out.length - 1];
      if (prev?.role === "user" && Array.isArray(prev.content)) {
        prev.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (m.role === "assistant" && m.tool_calls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      const text = asText(m.content).trim();
      if (text) blocks.push({ type: "text", text });
      for (const tc of m.tool_calls) {
        const fn = "function" in tc ? tc.function : null;
        const name = fn?.name ?? ("name" in tc ? String((tc as { name?: string }).name ?? "") : "");
        let input: Record<string, unknown> = {};
        if (fn?.arguments) {
          try {
            input = JSON.parse(fn.arguments) as Record<string, unknown>;
          } catch {
            input = { raw: fn.arguments };
          }
        } else if ("arguments" in tc && tc.arguments && typeof tc.arguments === "object") {
          input = tc.arguments as Record<string, unknown>;
        }
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name,
          input,
        });
      }
      out.push({ role: "assistant", content: blocks });
      continue;
    }

    out.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: asText(m.content),
    });
  }

  return out;
}
