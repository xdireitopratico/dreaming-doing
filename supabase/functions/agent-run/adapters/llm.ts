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
import { isNvidiaNimBaseUrl, normalizeMessagesForNim } from "./nim-messages.ts";
import { normalizeMessagesForAnthropic } from "./anthropic-messages.ts";
import { normalizeNimBaseUrl } from "../../_shared/nvidia-model.ts";
import { logger } from "../../_shared/logger.ts";

/** Parâmetros oficiais Nemotron (thinking + reasoning budget) — ver build.nvidia.com */
function nvidiaNimChatExtras(model: string): Record<string, unknown> | undefined {
  if (!/nemotron/i.test(model)) return undefined;
  return {
    chat_template_kwargs: { enable_thinking: true },
    reasoning_budget: 4_096,
    top_p: 0.95,
    temperature: 1,
  };
}

function toToolCall(raw: any): ToolCall {
  const id = raw.id ?? crypto.randomUUID();
  const name = raw.function?.name ?? raw.name ?? "";
  const argsRaw = raw.function?.arguments ?? raw.arguments ?? {};

  if (typeof argsRaw === "string") {
    try {
      return { id, name, arguments: JSON.parse(argsRaw) };
    } catch (err) {
      logger.warn("agent.llm.tool_arguments_parse_failed", {
        toolName: name,
        rawLength: argsRaw.length,
        rawPreview: argsRaw.slice(0, 200),
        error: err instanceof Error ? err.message : String(err),
      });
      return { id, name, arguments: { raw: argsRaw } };
    }
  }

  return { id, name, arguments: argsRaw };
}

function parseXmlToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  const toolCallMatches = content.matchAll(toolCallRegex);

  for (const match of toolCallMatches) {
    const inner = match[1];
    const funcMatch = inner.match(/<function=([^>]+)>/);
    if (!funcMatch) continue;

    const name = funcMatch[1];
    const args: Record<string, unknown> = {};

    const paramRegex = /<parameter=([^>]+)>([\s\S]*?)<\/parameter>/g;
    const paramMatches = inner.matchAll(paramRegex);

    for (const pm of paramMatches) {
      const paramName = pm[1];
      const paramValue = pm[2].trim();

      try {
        args[paramName] = JSON.parse(paramValue);
      } catch {
        args[paramName] = paramValue;
      }
    }

    calls.push({
      id: crypto.randomUUID(),
      name,
      arguments: args,
    });
  }

  return calls;
}

// ────────── Claude (Anthropic) ──────────
class ClaudeAdapter implements LLMProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string = "https://api.anthropic.com/v1",
    private model: string = "claude-sonnet-4-20250514",
  ) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const systemMsg = params.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const messages = normalizeMessagesForAnthropic(
      params.messages.filter((m) => m.role !== "system"),
    );

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages,
    };
    if (systemMsg) body.system = systemMsg;
    if (params.tools?.length) {
      body.tools = params.tools.map((t) => ({
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
    baseUrl: string = "https://api.openai.com/v1",
    private model: string = "gpt-4o",
  ) {
    this.baseUrl = isNvidiaNimBaseUrl(baseUrl)
      ? (normalizeNimBaseUrl(baseUrl) ?? baseUrl)
      : baseUrl;
  }

  private baseUrl: string;

  private logNimRequest(): void {
    if (!isNvidiaNimBaseUrl(this.baseUrl)) return;
    logger.info("agent.nim_request", {
      model: this.model,
      baseUrl: this.baseUrl,
      endpoint: `${this.baseUrl}/chat/completions`,
    });
  }

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

  private nimNormalizedMessages(params: ChatParams): ChatParams["messages"] {
    if (!isNvidiaNimBaseUrl(this.baseUrl)) return params.messages;
    return normalizeMessagesForNim(params.messages);
  }

  private normalizeMessagesForProvider(messages: ChatParams["messages"]): ChatParams["messages"] {
    const out: ChatParams["messages"] = [];
    for (const m of messages) {
      const role = m.role;
      let content = m.content ?? "";
      const hasToolCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
      const hasToolCallId = typeof m.tool_call_id === "string" && m.tool_call_id.length > 0;
      const isEmptyContent = content === "" || (Array.isArray(content) && content.length === 0);

      // Cohere/OpenRouter rejeita mensagens sem content e sem tool_calls/tool_call_id.
      if (isEmptyContent && !hasToolCalls && !hasToolCallId) continue;

      // Cohere exige content não-vazio em mensagens assistant que carregam tool_calls.
      if (role === "assistant" && hasToolCalls && isEmptyContent) {
        content = ".";
      }

      out.push({ ...m, content });
    }
    return out;
  }

  private async chatCompletions(params: ChatParams): Promise<ChatResponse> {
    if (params.onTokenDelta || params.onReasoningDelta) {
      return this.chatCompletionsStream(params);
    }

    const messages = this.normalizeMessagesForProvider(this.nimNormalizedMessages(params)).map(
      (m) => {
        const msg: any = { role: m.role, content: m.content ?? "" };
        if (Array.isArray(m.content)) msg.content = m.content;
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) {
          msg.tool_call_id = m.tool_call_id;
          msg.role = "tool";
        }
        if (m.name) msg.name = m.name;
        return msg;
      },
    );

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages,
    };

    if (params.tools?.length) {
      body.tools = params.tools.map((t) => ({
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

    this.logNimRequest();
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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

    let toolCalls = (msg?.tool_calls ?? []).map(toToolCall);

    if (
      toolCalls.length === 0 &&
      msg?.content &&
      typeof msg.content === "string" &&
      msg.content.includes("<tool_call>")
    ) {
      toolCalls = parseXmlToolCalls(msg.content);
    }

    return {
      role: "assistant",
      content: msg?.content ?? null,
      tool_calls: toolCalls,
      usage: mapUsage(data.usage),
    };
  }

  private async chatCompletionsStream(params: ChatParams): Promise<ChatResponse> {
    const messages = this.normalizeMessagesForProvider(this.nimNormalizedMessages(params)).map(
      (m) => {
        const msg: any = { role: m.role, content: m.content ?? "" };
        if (Array.isArray(m.content)) msg.content = m.content;
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) {
          msg.tool_call_id = m.tool_call_id;
          msg.role = "tool";
        }
        if (m.name) msg.name = m.name;
        return msg;
      },
    );

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages,
      stream: true,
    };

    if (params.tools?.length) {
      body.tools = params.tools.map((t) => ({
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

    this.logNimRequest();
    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
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

    // Buffer de payload SSE entre eventos — usado para remontar JSON
    // que pode vir quebrado em múltiplas linhas (ex.: provider não escapa \n
    // dentro de string values, ou envia JSON pretty-printed).
    let ssePayloadBuffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE delimitador: \n\n separa eventos completos.
      // Dentro de um evento, linhas que começam com "data:" são concatenadas.
      const parts = buffer.split("\n\n");
      // A última parte pode estar incompleta — preservar no buffer.
      buffer = parts.pop() ?? "";

      for (const eventBlock of parts) {
        const lines = eventBlock.split("\n");
        let eventJson = "";
        let sawData = false;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") {
              // Evento de fim: processa payload acumulado antes (se houver)
              if (eventJson) {
                try {
                  const parsed = JSON.parse(eventJson);
                  processChunk(parsed);
                } catch {
                  /* ignora — payload do [DONE] não deve ter dados pendentes */
                }
              }
              eventJson = "";
              sawData = false;
              continue;
            }
            sawData = true;
            eventJson += payload;
          } else if (sawData && trimmed && !trimmed.startsWith(":")) {
            // Linha sem "data:" mas dentro de um evento SSE — pode ser
            // continuação de um JSON string que contém quebra de linha real.
            eventJson += trimmed;
          }
        }

        // Tenta parsear o JSON completo do evento
        if (eventJson) {
          try {
            const parsed = JSON.parse(eventJson);
            ssePayloadBuffer = ""; // limpou — payload completo processado
            processChunk(parsed);
          } catch {
            // JSON incompleto — acumula no buffer de payload SSE
            // para remontar quando o próximo chunk chegar.
            ssePayloadBuffer += eventJson;
          }
        }
      }

      // Tenta parsear o buffer acumulado (pode ter sido completado pelo chunk atual)
      if (ssePayloadBuffer) {
        try {
          const parsed = JSON.parse(ssePayloadBuffer);
          ssePayloadBuffer = "";
          processChunk(parsed);
        } catch {
          // Ainda incompleto — continua acumulando
        }
      }
    }

    // Processa payload residual no buffer e no ssePayloadBuffer
    const finalPayload = (ssePayloadBuffer ? ssePayloadBuffer + "\n" : "") + buffer.trim();
    if (finalPayload) {
      // Tenta extrair dados de linhas "data:" no residual
      for (const line of finalPayload.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const payload = trimmed.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            try {
              const parsed = JSON.parse(payload);
              processChunk(parsed);
            } catch {
              /* residual incompleto — ignora */
            }
          }
        }
      }
    }

    /** Processa um chunk SSE parseado — extrai text, tool_calls e usage. */
    function processChunk(parsed: any): void {
      if (parsed.usage) {
        usage = mapUsage(parsed.usage);
      }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return;

      if (delta.content) {
        text += delta.content;
        params.onTokenDelta?.(delta.content);
      }

      // Raciocínio real do modelo (reasoning models) — a VERDADE que deve ir pro inspector.
      const reasoning = (delta as any).reasoning_content ?? (delta as any).reasoning;
      if (reasoning) {
        params.onReasoningDelta?.(reasoning);
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

    const parsedToolCalls = [...toolCalls.values()]
      .filter((tc) => tc.name)
      .map((tc) =>
        toToolCall({
          id: tc.id,
          function: { name: tc.name, arguments: tc.arguments },
        }),
      );

    let finalToolCalls = parsedToolCalls;

    if (finalToolCalls.length === 0 && text && text.includes("<tool_call>")) {
      finalToolCalls = parseXmlToolCalls(text);
    }

    return {
      role: "assistant",
      content: text || null,
      tool_calls: finalToolCalls,
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
      ? [
          {
            functionDeclarations: params.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ]
      : [];

    const contents = params.messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const role = m.role === "assistant" ? "model" : m.role;
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            let args: Record<string, unknown> = {};
            if (typeof tc.function.arguments === "string") {
              try {
                args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
              } catch (err) {
                logger.warn("agent.llm.gemini_tool_arguments_parse_failed", {
                  toolName: tc.function.name,
                  rawLength: tc.function.arguments.length,
                  error: err instanceof Error ? err.message : String(err),
                });
                args = { raw: tc.function.arguments };
              }
            }
            parts.push({
              functionCall: {
                name: tc.function.name,
                args,
              },
            });
          }
        }
        return { role, parts };
      });

    const systemMsg = params.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: params.max_tokens ?? 4096,
        temperature: params.temperature ?? 0.7,
      },
    };
    if (tools.length) {
      body.tools = tools;
    }
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
    if (params.onTokenDelta || params.onReasoningDelta) {
      const adapter = new OpenAIAdapter(this.apiKey, this.baseUrl, this.model);
      return adapter.chat(params);
    }

    const body: any = {
      model: this.model,
      max_tokens: params.max_tokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      messages: params.messages.map((m) => {
        const msg: any = { role: m.role, content: m.content ?? "" };
        if (Array.isArray(m.content)) msg.content = m.content;
        if (m.tool_calls) msg.tool_calls = m.tool_calls;
        if (m.tool_call_id) {
          msg.tool_call_id = m.tool_call_id;
          msg.role = "tool";
        }
        return msg;
      }),
    };

    if (params.tools?.length) {
      body.tools = params.tools.map((t) => ({
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
        Authorization: `Bearer ${this.apiKey}`,
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
      messages: params.messages.map((m) => {
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
      return new GeminiAdapter(config.apiKey, config.baseUrl, config.model);
    case "openrouter":
      return new OpenRouterAdapter(config.apiKey, config.model);
    case "ollama":
      return new OllamaAdapter(config.baseUrl, config.model);
    default:
      return new OpenAIAdapter(
        config.apiKey,
        config.baseUrl ?? `https://api.${p}.com/v1`,
        config.model,
      );
  }
}
