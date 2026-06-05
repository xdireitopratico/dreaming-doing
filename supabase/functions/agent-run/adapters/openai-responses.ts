// OpenAI Responses API — obrigatório para GPT-5.x com tools (Chat Completions → 404).
import type { ChatMessage, ChatParams, ChatResponse, ToolCall } from "../types.ts";
import { normalizeChatUsage } from "../token-usage.ts";
import { formatLlmApiError } from "./api-error.ts";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function isOfficialOpenAiBaseUrl(baseUrl: string): boolean {
  const u = normalizeBaseUrl(baseUrl);
  return u === "https://api.openai.com/v1" || u === "https://api.openai.com";
}

/** Modelos frontier OpenAI que devem usar /v1/responses em vez de chat/completions. */
export function shouldUseOpenAiResponsesApi(model: string, baseUrl: string): boolean {
  if (!isOfficialOpenAiBaseUrl(baseUrl)) return false;
  const m = model.toLowerCase();
  return (
    m.startsWith("gpt-5") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4") ||
    m.includes("codex")
  );
}

function messageContent(m: ChatMessage): string | unknown[] {
  if (m.content == null) return "";
  return m.content;
}

function messagesToResponsesPayload(messages: ChatMessage[]): {
  instructions?: string;
  input: unknown[];
} {
  const systemParts: string[] = [];
  const input: unknown[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      const text = typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content ?? "");
      if (text) systemParts.push(text);
      continue;
    }

    if (m.role === "user") {
      input.push({ role: "user", content: messageContent(m) });
      continue;
    }

    if (m.role === "assistant") {
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
      }
      const text = typeof m.content === "string" ? m.content : "";
      if (text) {
        input.push({ role: "assistant", content: text });
      }
      continue;
    }

    if (m.role === "tool" && m.tool_call_id) {
      const out = typeof m.content === "string"
        ? m.content
        : JSON.stringify(m.content ?? "");
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: out,
      });
    }
  }

  return {
    instructions: systemParts.length ? systemParts.join("\n\n") : undefined,
    input,
  };
}

function parseResponsesOutput(data: Record<string, unknown>): ChatResponse {
  let text = "";
  if (typeof data.output_text === "string") {
    text = data.output_text;
  }

  const toolCalls: ToolCall[] = [];
  const output = data.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const type = row.type as string;

      if (type === "message") {
        const content = row.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (!block || typeof block !== "object") continue;
            const b = block as Record<string, unknown>;
            if (b.type === "output_text" && typeof b.text === "string") {
              text += b.text;
            }
          }
        }
      }

      if (type === "function_call") {
        const argsRaw = row.arguments;
        let args: Record<string, unknown> = {};
        if (typeof argsRaw === "string") {
          try {
            args = JSON.parse(argsRaw) as Record<string, unknown>;
          } catch {
            args = {};
          }
        } else if (argsRaw && typeof argsRaw === "object") {
          args = argsRaw as Record<string, unknown>;
        }
        toolCalls.push({
          id: String(row.call_id ?? row.id ?? crypto.randomUUID()),
          name: String(row.name ?? ""),
          arguments: args,
        });
      }
    }
  }

  const usage = normalizeChatUsage(data.usage);

  return {
    role: "assistant",
    content: text || null,
    tool_calls: toolCalls,
    usage,
  };
}

export async function chatOpenAiResponses(
  apiKey: string,
  baseUrl: string,
  model: string,
  params: ChatParams,
): Promise<ChatResponse> {
  const root = normalizeBaseUrl(baseUrl);
  const { instructions, input } = messagesToResponsesPayload(params.messages);

  const body: Record<string, unknown> = {
    model,
    input,
    store: false,
    reasoning: { effort: "medium" },
    max_output_tokens: params.max_tokens ?? 4096,
  };
  if (instructions) body.instructions = instructions;

  if (params.tools?.length) {
    body.tools = params.tools.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      strict: false,
    }));
  }

  const resp = await fetch(`${root}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(formatLlmApiError(baseUrl, resp.status, err));
  }

  const data = await resp.json() as Record<string, unknown>;
  return parseResponsesOutput(data);
}

export function isOpenAiModelNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\b404\b/.test(msg) && /openai api error/i.test(msg);
}