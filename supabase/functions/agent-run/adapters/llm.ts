// adapters/llm.ts — LLM Adapter model-agnostic
// Suporte: Claude, OpenAI, Gemini, OpenRouter, Ollama, Custom (OpenAI-compatible)
import type { LLMProvider, ChatParams, ChatResponse, ChatMessage, ToolCall } from "../types.ts";
import { formatLlmApiError } from "./api-error.ts";
import { normalizeChatUsage } from "../token-usage.ts";

function mapUsage(raw: unknown): ChatResponse["usage"] | undefined {
  return normalizeChatUsage(raw);
}
import {
  chatOpenAiResponses,
  isOfficialOpenAiBaseUrl,
  isOpenAiModelNotFound,
  shouldUseOpenAiResponsesApi,
} from "./openai-responses.ts";

function isNvidiaNimBaseUrl(baseUrl: string): boolean {
  return baseUrl.includes("integrate.api.nvidia.com");
}

/** Parâmetros oficiais Nemotron (thinking + reasoning budget) — ver build.nvidia.com */
function nvidiaNimChatExtras(model: string): Record<string, unknown> | undefined {
  if (!/nemotron/i.test(model)) return undefined;
  return {
    chat_template_kwargs: { enable_thinking: true },
    reasoning_budget: 16_384,
    top_p: 0.95,
    temperature: 1,
  };
}

function toToolCall(raw: any): ToolCall {
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.function?.name ?? raw.name ?? "",
    arguments: typeof raw.function?.arguments === "string"
      ? JSON.parse(raw.function.arguments)
      : (raw.function?.arguments ?? raw.arguments ?? {}),
  };
}

// ────────── Claude (Anthropic) ──────────
class ClaudeAdapter implements LLMProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string = "https://api.anthropic.com/v1",
    private model: string = "claude-sonnet-4-20250514",
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const systemMsg = params.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const messages = params.messages.filter(m => m.role !== "system").map(m => ({
      role: m.role,
      content: m.content ?? "",
    }));

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages,
    };
    if (systemMsg) body.system = systemMsg;
    if (params.tools?.length) {
      body.tools = params.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const resp = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(formatLlmApiError(this.baseUrl, resp.status, err));
    }

    const data = await resp.json();
    const content = data.content ?? [];
    let text = "";
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input ?? {},
        });
      }
    }

    return {
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls,
      usage: mapUsage(data.usage),
    };
  }
}

// ────────── OpenAI (GPT-4, GPT-4o, etc) ──────────
class OpenAIAdapter implements LLMProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string = "https://api.openai.com/v1",
    private model: string = "gpt-4o",
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    if (shouldUseOpenAiResponsesApi(this.model, this.baseUrl)) {
      return chatOpenAiResponses(this.apiKey, this.baseUrl, this.model, params);
    }

    try {
      return await this.chatCompletions(params);
    } catch (err: unknown) {
      if (isOpenAiModelNotFound(err) && isOfficialOpenAiBaseUrl(this.baseUrl)) {
        return chatOpenAiResponses(this.apiKey, this.baseUrl, this.model, params);
      }
      throw err;
    }
  }

  private async chatCompletions(params: ChatParams): Promise<ChatResponse> {
    if (params.onTokenDelta) {
      return this.chatCompletionsStream(params);
    }

    const messages = params.messages.map(m => {
      const msg: any = { role: m.role, content: m.content ?? "" };
      if (Array.isArray(m.content)) msg.content = m.content;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id) { msg.tool_call_id = m.tool_call_id; msg.role = "tool"; }
      if (m.name) msg.name = m.name;
      return msg;
    });

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages,
    };

    if (params.tools?.length) {
      body.tools = params.tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = params.tool_choice ?? "auto";
    }

    if (params.response_format) {
      body.response_format = params.response_format;
    }

    if (isNvidiaNimBaseUrl(this.baseUrl)) {
      const extras = nvidiaNimChatExtras(this.model);
      if (extras) Object.assign(body, extras);
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(formatLlmApiError(this.baseUrl, resp.status, err));
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;

    return {
      role: "assistant",
      content: msg?.content ?? null,
      tool_calls: (msg?.tool_calls ?? []).map(toToolCall),
      usage: mapUsage(data.usage),
    };
  }

  private async chatCompletionsStream(params: ChatParams): Promise<ChatResponse> {
    const messages = params.messages.map(m => {
      const msg: any = { role: m.role, content: m.content ?? "" };
      if (Array.isArray(m.content)) msg.content = m.content;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      if (m.tool_call_id) { msg.tool_call_id = m.tool_call_id; msg.role = "tool"; }
      if (m.name) msg.name = m.name;
      return msg;
    });

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages,
      stream: true,
    };

    if (params.tools?.length) {
      body.tools = params.tools.map(t => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = params.tool_choice ?? "auto";
    }

    if (params.response_format) {
      body.response_format = params.response_format;
    }

    if (isNvidiaNimBaseUrl(this.baseUrl)) {
      const extras = nvidiaNimChatExtras(this.model);
      if (extras) Object.assign(body, extras);
    }

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(formatLlmApiError(this.baseUrl, resp.status, err));
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      throw new Error("Stream indisponível na resposta do modelo");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: ChatResponse["usage"];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let parsed: any;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        if (parsed.usage) {
          usage = mapUsage(parsed.usage);
        }

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          text += delta.content;
          params.onTokenDelta?.(delta.content);
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const raw of delta.tool_calls) {
            const idx = typeof raw.index === "number" ? raw.index : 0;
            const existing = toolCalls.get(idx) ?? {
              id: raw.id ?? crypto.randomUUID(),
              name: "",
              arguments: "",
            };
            if (raw.id) existing.id = raw.id;
            if (raw.function?.name) existing.name = raw.function.name;
            if (raw.function?.arguments) existing.arguments += raw.function.arguments;
            toolCalls.set(idx, existing);
          }
        }
      }
    }

    const parsedToolCalls = [...toolCalls.values()]
      .filter((tc) => tc.name)
      .map((tc) => toToolCall({
        id: tc.id,
        function: { name: tc.name, arguments: tc.arguments },
      }));

    return {
      role: "assistant",
      content: text || null,
      tool_calls: parsedToolCalls,
      usage,
    };
  }
}

// ────────── Gemini (Google) ──────────
class GeminiAdapter implements LLMProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string = "https://generativelanguage.googleapis.com/v1beta",
    private model: string = "gemini-2.5-flash",
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const tools = params.tools?.length
      ? [{ functionDeclarations: params.tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })) }]
      : [];

    const contents = params.messages
      .filter(m => m.role !== "system")
      .map(m => {
        const role = m.role === "assistant" ? "model" : m.role;
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: typeof tc.function.arguments === "string"
                  ? JSON.parse(tc.function.arguments)
                  : tc.function.arguments,
              },
            });
          }
        }
        return { role, parts };
      });

    const systemMsg = params.messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: params.max_tokens ?? 4096,
        temperature: params.temperature ?? 0.7,
      },
    };
    if (tools.length) { body.tools = tools; }
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg }] };
    }

    const resp = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Gemini API error ${resp.status}: ${err.slice(0, 300)}`);
    }

    const data = await resp.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        toolCalls.push({
          id: crypto.randomUUID(),
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }

    return {
      role: "assistant",
      content: text || null,
      tool_calls: toolCalls,
      usage: mapUsage(data.usageMetadata),
    };
  }
}

// ────────── OpenRouter (qualquer modelo via API unificada) ──────────
class OpenRouterAdapter implements LLMProvider {
  constructor(
    private apiKey: string,
    private model: string = "anthropic/claude-sonnet-4",
    private baseUrl: string = "https://openrouter.ai/api/v1",
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    if (params.onTokenDelta) {
      const adapter = new OpenAIAdapter(this.apiKey, this.baseUrl, this.model);
      return adapter.chat(params);
    }

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages: params.messages.map(m => {
        const msg: any = { role: m.role, content: m.content ?? "" };
        if (Array.isArray(m.content)) msg.content = m.content;
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) { msg.tool_call_id = m.tool_call_id; msg.role = "tool"; }
        return msg;
      }),
    };

    if (params.tools?.length) {
      body.tools = params.tools.map(t => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = params.tool_choice ?? "auto";
    }

    if (params.response_format) body.response_format = params.response_format;

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://dreaming-doing.app",
        "X-Title": "Dream Weaver",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenRouter API error ${resp.status}: ${err.slice(0, 300)}`);
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;

    return {
      role: "assistant",
      content: msg?.content ?? null,
      tool_calls: (msg?.tool_calls ?? []).map(toToolCall),
      usage: mapUsage(data.usage),
    };
  }
}

// ────────── Ollama (local) ──────────
class OllamaAdapter implements LLMProvider {
  constructor(
    private baseUrl: string = "http://localhost:11434",
    private model: string = "llama3.2",
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const tools: any[] = [];
    if (params.tools?.length) {
      for (const t of params.tools) {
        tools.push({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        });
      }
    }

    const body: any = {
      model: this.model,
      stream: false,
      messages: params.messages.map(m => {
        const msg: any = { role: m.role, content: m.content ?? "" };
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        return msg;
      }),
    };
    if (tools.length) body.tools = tools;

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Ollama error ${resp.status}: ${err.slice(0, 300)}`);
    }

    const data = await resp.json();
    const msg = data.message;

    return {
      role: "assistant",
      content: msg?.content ?? null,
      tool_calls: (msg?.tool_calls ?? []).map(toToolCall),
    };
  }
}

// ────────── Factory ──────────
export function createLLMProvider(config: {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): LLMProvider {
  const p = config.provider.toLowerCase();
  switch (p) {
    case "claude":
    case "anthropic":
      return new ClaudeAdapter(config.apiKey, config.baseUrl, config.model);
    case "openai":
      return new OpenAIAdapter(config.apiKey, config.baseUrl, config.model);
    case "gemini":
    case "google":
      return new GeminiAdapter(config.apiKey, undefined, config.model);
    case "openrouter":
      return new OpenRouterAdapter(config.apiKey, config.model);
    case "ollama":
      return new OllamaAdapter(config.baseUrl, config.model);
    default:
      return new OpenAIAdapter(config.apiKey, config.baseUrl ?? `https://api.${p}.com/v1`, config.model);
  }
}
