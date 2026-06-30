// OpenAI Responses API — obrigatório para GPT-5.x com tools (Chat Completions → 404).
import type { ChatMessage, ChatParams, ChatResponse, ToolCall } from "../types.ts";
import { normalizeChatUsage } from "../token-usage.ts";
import { formatLlmApiError } from "./api-error.ts";
import { consumeSseFrames, safeJsonParse } from "./streaming.ts";

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
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
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
      const out = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
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

type ResponsesToolCallState = {
  id: string;
  name: string;
  arguments: string;
};

type ResponsesStreamState = {
  text: string;
  toolCallsByKey: Map<string, ResponsesToolCallState>;
  usage?: ChatResponse["usage"];
  finalResponse: Record<string, unknown> | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeResponsesToolCallState(
  current: ResponsesToolCallState | undefined,
  raw: Record<string, unknown>,
): ResponsesToolCallState {
  const next = current ?? {
    id: String(raw.call_id ?? raw.item_id ?? raw.id ?? crypto.randomUUID()),
    name: "",
    arguments: "",
  };

  const id = raw.call_id ?? raw.item_id ?? raw.id;
  if (typeof id === "string" && id) next.id = id;

  const name =
    raw.name ??
    (raw.function && typeof raw.function === "object"
      ? (raw.function as Record<string, unknown>).name
      : undefined);
  if (typeof name === "string" && name) next.name = name;

  const args =
    raw.arguments ??
    raw.delta ??
    (raw.function && typeof raw.function === "object"
      ? (raw.function as Record<string, unknown>).arguments
      : undefined);
  if (typeof args === "string") {
    next.arguments += args;
  } else if (args && typeof args === "object") {
    try {
      next.arguments = JSON.stringify(args);
    } catch {
      next.arguments = "";
    }
  }

  return next;
}

function toolCallStateToToolCall(tc: ResponsesToolCallState): ToolCall | null {
  if (!tc.name) return null;
  let args: Record<string, unknown> = {};
  if (tc.arguments.trim()) {
    try {
      args = JSON.parse(tc.arguments) as Record<string, unknown>;
    } catch {
      args = { raw: tc.arguments };
    }
  }
  return {
    id: tc.id,
    name: tc.name,
    arguments: args,
  };
}

function responsePayloadFromEvent(parsed: Record<string, unknown>): Record<string, unknown> | null {
  if (parsed.response && typeof parsed.response === "object") {
    return parsed.response as Record<string, unknown>;
  }
  if (parsed.type === "response.completed" || parsed.type === "response.output_text.done") {
    return parsed;
  }
  return null;
}

function ingestResponsesStreamEvent(
  parsed: Record<string, unknown>,
  state: ResponsesStreamState,
  params: ChatParams,
): void {
  const eventType = asString(parsed.type) || asString(parsed.event);

  const delta = asString(parsed.delta) || asString(parsed.text);
  if (eventType === "response.output_text.delta" && delta) {
    state.text += delta;
    params.onTokenDelta?.(delta);
    return;
  }

  if (
    eventType === "response.reasoning.delta" ||
    eventType === "response.reasoning_text.delta" ||
    eventType === "response.reasoning_summary.delta" ||
    eventType === "response.reasoning_summary_text.delta"
  ) {
    const reasoningDelta =
      delta ||
      asString(parsed.summary_text) ||
      asString(parsed.summary) ||
      asString(parsed.content);
    if (reasoningDelta) params.onReasoningDelta?.(reasoningDelta);
    return;
  }

  if (
    eventType === "response.function_call_arguments.delta" ||
    eventType === "response.function_call_arguments.done"
  ) {
    const key = asString(parsed.call_id) || asString(parsed.item_id) || asString(parsed.id) || "0";
    const current = state.toolCallsByKey.get(key);
    state.toolCallsByKey.set(
      key,
      normalizeResponsesToolCallState(current, {
        ...parsed,
        arguments: asString(parsed.arguments) || asString(parsed.delta),
      }),
    );
    return;
  }

  if (
    eventType === "response.output_item.added" ||
    eventType === "response.output_item.done"
  ) {
    const item = parsed.item;
    if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      const type = asString(row.type);
      if (type === "function_call") {
        const key = asString(row.call_id) || asString(row.id) || "0";
        const current = state.toolCallsByKey.get(key);
        state.toolCallsByKey.set(key, normalizeResponsesToolCallState(current, row));
      }
    }
    return;
  }

  if (eventType === "response.completed") {
    const payload = responsePayloadFromEvent(parsed);
    if (payload) state.finalResponse = payload;
    if (parsed.usage) state.usage = normalizeChatUsage(parsed.usage);
    return;
  }

  if (eventType === "error") {
    const message =
      asString(parsed.message) ||
      (parsed.error && typeof parsed.error === "object"
        ? asString((parsed.error as Record<string, unknown>).message)
        : "") ||
      "OpenAI Responses streaming error";
    throw new Error(message);
  }
}

function mergeToolCalls(
  streamed: ToolCall[],
  parsed: ToolCall[],
): ToolCall[] {
  if (streamed.length === 0) return parsed;
  if (parsed.length === 0) return streamed;
  const byId = new Map<string, ToolCall>();
  for (const tc of parsed) byId.set(tc.id, tc);
  for (const tc of streamed) byId.set(tc.id, tc);
  return [...byId.values()];
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
    reasoning: { effort: params.reasoningEffort ?? "low" },
    max_output_tokens: params.max_tokens ?? 4096,
  };
  if (instructions) body.instructions = instructions;
  const useStream = Boolean(params.onTokenDelta || params.onReasoningDelta);
  if (useStream) body.stream = true;

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
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(formatLlmApiError(baseUrl, resp.status, err));
  }

  if (!useStream) {
    const data = (await resp.json()) as Record<string, unknown>;
    return parseResponsesOutput(data);
  }

  const state: ResponsesStreamState = {
    text: "",
    toolCallsByKey: new Map(),
    finalResponse: null,
  };

  await consumeSseFrames(resp, (frame) => {
    if (!frame.data) return;
    const parsed = safeJsonParse<Record<string, unknown>>(frame.data);
    if (!parsed) return;
    if (!parsed.type && frame.event) {
      parsed.event = frame.event;
    }
    ingestResponsesStreamEvent(parsed, state, params);
  });

  const streamedToolCalls = [...state.toolCallsByKey.values()]
    .map(toolCallStateToToolCall)
    .filter((tc): tc is ToolCall => tc !== null);

  const parsedFinal = state.finalResponse ? parseResponsesOutput(state.finalResponse) : null;
  if (!parsedFinal) {
    return {
      role: "assistant",
      content: state.text || null,
      tool_calls: streamedToolCalls,
      usage: state.usage,
    };
  }

  return {
    ...parsedFinal,
    content: state.text || parsedFinal.content,
    tool_calls: mergeToolCalls(streamedToolCalls, parsedFinal.tool_calls),
    usage: state.usage ?? parsedFinal.usage,
  };
}

export function isOpenAiModelNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /\b404\b/.test(msg) && /openai api error/i.test(msg);
}
