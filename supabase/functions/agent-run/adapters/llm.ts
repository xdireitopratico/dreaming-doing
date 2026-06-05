// adapters/llm.ts — LLM Adapter model-agnostic
// Suporte: Claude, OpenAI, Gemini, OpenRouter, Ollama, Custom (OpenAI-compatible)
import type { LLMProvider, ChatParams, ChatResponse, ChatMessage, ToolCall } from "../types.ts";
import {
  chatOpenAiResponses,
  isOfficialOpenAiBaseUrl,
  isOpenAiModelNotFound,
  shouldUseOpenAiResponsesApi,
} from "./openai-responses.ts";

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
      throw new Error(`Claude API error ${resp.status}: ${err.slice(0, 300)}`);
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
      usage: data.usage,
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
      throw new Error(`OpenAI API error ${resp.status}: ${err.slice(0, 300)}`);
    }

    const data = await resp.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;

    return {
      role: "assistant",
      content: msg?.content ?? null,
      tool_calls: (msg?.tool_calls ?? []).map(toToolCall),
      usage: data.usage,
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
      usage: data.usageMetadata,
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
      usage: data.usage,
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
