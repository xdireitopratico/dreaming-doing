/**
 * llm-router.ts — Universal LLM Router for AetherForge
 * Routes requests to any provider with BYOK tenant secret priority.
 * 
 * @version 1.0.0 — Round 35
 * 
 * Routing: model_id → resolveModelForAPI() → provider → endpoint + auth
 * Secret priority: 1° tenant_secret (BYOK) → 2° env var (platform)
 * Anthropic: Messages API adapter → OpenAI-compatible response
 * Cost: calculated per model from catalog pricing
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveModelForAPI, findProvider, PROVIDERS, getAuthorizedOllamaModels, type ModelDefinition } from "./model-catalog.ts";
import { meteredFetch } from "./egress-meter.ts";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface LLMRequest {
  model_id: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  /** OpenAI-compatible tool definitions */
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  /** Tool choice: "auto", "none", "required", or specific function */
  tool_choice?: string | Record<string, unknown>;
  /** tenant_id for BYOK secret lookup */
  tenant_id?: string;
  /** Max polling time for async providers (Ollama/Celery). Default: 55s (safe for Edge Functions) */
  maxPollMs?: number;
  /** Authority slot for Ollama gate (e.g. "heartbeat", "memory_cron") */
  authority_slot?: string;
  /** User ID for Ollama gate (interactive chat) */
  authority_user_id?: string;
  /** Logical feature name for cost attribution in ai_usage_logs */
  feature?: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  cost_cents: number;
  finish_reason: string;
  /** Native tool calls returned by the model */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  raw?: any;
}

// ═══════════════════════════════════════════════════════════
// COST TABLE (per 1K tokens, in USD)
// ═══════════════════════════════════════════════════════════

const COST_TABLE: Record<string, { in: number; out: number }> = {
  // Ollama — free (local)
  "ollama": { in: 0, out: 0 },
  // Groq
  "groq/llama-3.1-8b-instant": { in: 0.00005, out: 0.00008 },
  "groq/llama-3.3-70b-versatile": { in: 0.00059, out: 0.00079 },
  "groq/gemma2-9b-it": { in: 0.0002, out: 0.0002 },
  // xAI
  "xai/grok-4.20-multi-agent-0309": { in: 0.002, out: 0.006 },
  "xai/grok-4.20-0309-reasoning": { in: 0.002, out: 0.006 },
  "xai/grok-4.20-0309-non-reasoning": { in: 0.002, out: 0.006 },
  "xai/grok-4-1-fast-reasoning": { in: 0.0002, out: 0.0005 },
  "xai/grok-4-1-fast-non-reasoning": { in: 0.0002, out: 0.0005 },
  // Anthropic
  "anthropic/claude-haiku-4-5": { in: 0.0008, out: 0.004 },
  "anthropic/claude-sonnet-4-5": { in: 0.003, out: 0.015 },
  "anthropic/claude-opus-4-6": { in: 0.015, out: 0.075 },
  // OpenAI (direct via OPENAI_API_KEY)
  "openai/gpt-5.4": { in: 0.005, out: 0.015 },
  "openai/gpt-5.2": { in: 0.005, out: 0.015 },
  "openai/gpt-5": { in: 0.005, out: 0.015 },
  "openai/gpt-4.1": { in: 0.002, out: 0.008 },
  "openai/gpt-5-mini": { in: 0.0003, out: 0.0012 },
  "openai/gpt-5-mini-2025-08-07": { in: 0.0003, out: 0.0012 },
  "openai/gpt-4.1-mini": { in: 0.0004, out: 0.0016 },
  "openai/gpt-5-nano": { in: 0.0001, out: 0.0004 },
  "openai/gpt-4.1-nano": { in: 0.0001, out: 0.0004 },
  // Lovable AI Gateway — billing internal
  "lovable": { in: 0, out: 0 },
  // Google AI (direct)
  "google": { in: 0.00015, out: 0.0006 },
  // OpenRouter
  "openrouter": { in: 0, out: 0 },
  // NVIDIA NIM — free tier
  "nvidia": { in: 0, out: 0 },
  // Perplexity
  "perplexity/sonar": { in: 0.001, out: 0.001 },
  "perplexity/sonar-pro": { in: 0.003, out: 0.015 },
};

function calculateCost(modelId: string, provider: string, tokensIn: number, tokensOut: number): number {
  const pricing = COST_TABLE[modelId] || COST_TABLE[provider] || { in: 0, out: 0 };
  const costUsd = (tokensIn / 1000) * pricing.in + (tokensOut / 1000) * pricing.out;
  return Math.round(costUsd * 100 * 100) / 100; // cents, 2 decimals
}

// ═══════════════════════════════════════════════════════════
// PROVIDER SECRET MAPPING
// ═══════════════════════════════════════════════════════════

const PROVIDER_SECRET_MAP: Record<string, string> = {
  groq: "GROQ_API_KEY",
  xai: "XAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  lovable: "LOVABLE_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  // NVIDIA uses per-model secrets — handled separately
};

const NVIDIA_SECRET_MAP: Record<string, string> = {
  "qwen/qwen3.5-397b-a17b": "NVIDIA_QWEN35_397B_A17B_API_KEY",
  "nvidia/nemotron-3-super-120b-a12b": "NVIDIA_NEMOTRON3_SUPER_120B_API_KEY",
  "nvidia/nemotron-3-nano-30b-a3b": "NVIDIA_NEMOTRON3_SUPER_30B_API_KEY",
};

// ═══════════════════════════════════════════════════════════
// TENANT SECRET RESOLVER (BYOK priority)
// ═══════════════════════════════════════════════════════════

async function resolveTenantSecret(
  tenantId: string | undefined,
  secretName: string,
): Promise<string | null> {
  if (!tenantId) return null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data } = await supabase
      .from("tenant_secrets")
      .select("encrypted_value")
      .eq("tenant_id", tenantId)
      .eq("secret_name", secretName)
      .single();

    if (data?.encrypted_value) {
      // Update access count
      await supabase
        .from("tenant_secrets")
        .update({
          access_count: (data as any).access_count ? (data as any).access_count + 1 : 1,
          last_accessed_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .eq("secret_name", secretName);

      // Decode (currently base64; future: AES-256-GCM)
      try {
        return atob(data.encrypted_value);
      } catch {
        return data.encrypted_value;
      }
    }
  } catch (err) {
    console.warn(`[llm-router] Failed to resolve tenant secret ${secretName}:`, err);
  }
  return null;
}

/**
 * Resolve API key: BYOK tenant secret ONLY.
 * PADR-014: No fallback to platform env vars. If the user hasn't configured
 * their API key for the chosen provider, it's an explicit error.
 * Ollama doesn't need an API key (local/VPS).
 */
async function resolveApiKey(
  provider: string,
  modelName: string,
  tenantId?: string,
): Promise<string> {
  // Ollama doesn't require API keys
  if (provider === "ollama") return "";

  // 1. Determine the secret name
  let secretName: string;
  if (provider === "nvidia") {
    secretName = NVIDIA_SECRET_MAP[modelName] || "NVIDIA_API_KEY";
  } else {
    secretName = PROVIDER_SECRET_MAP[provider] || `${provider.toUpperCase()}_API_KEY`;
  }

  // 2. Try BYOK tenant secret
  const tenantKey = await resolveTenantSecret(tenantId, secretName);
  if (tenantKey) {
    console.log(`[llm-router] Using BYOK key for ${provider} (tenant: ${tenantId})`);
    return tenantKey;
  }

  // 3. Try platform env var (for testing phase — admin-configured secrets)
  const envKey = Deno.env.get(secretName);
  if (envKey) {
    console.log(`[llm-router] Using platform secret for ${provider} (${secretName})`);
    return envKey;
  }

  // PADR-014: No key available — deterministic error
  throw new Error(
    `missing_credentials: Chave API "${secretName}" não configurada para o provedor "${provider}". ` +
    `Configure sua chave em Configurações > Segredos ou selecione outro modelo.`
  );
}

// ═══════════════════════════════════════════════════════════
// PROVIDER-SPECIFIC CALLERS
// ═══════════════════════════════════════════════════════════

/** OpenAI-compatible call (Groq, xAI, OpenAI/Lovable Gateway, NVIDIA NIM, Perplexity) */
async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  modelName: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  extraHeaders?: Record<string, string>,
  timeoutMs = 55000,
  tools?: LLMRequest["tools"],
  toolChoice?: LLMRequest["tool_choice"],
): Promise<{ content: string; tokens_in: number; tokens_out: number; finish_reason: string; tool_calls?: any[]; raw: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: Record<string, unknown> = {
      model: modelName,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = toolChoice || "auto";
    }

    const res = await meteredFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...(extraHeaders || {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }, { source: "llm-router:openai-compat", category: "llm", metadata: { model: modelName } });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      if (res.status === 429) throw new Error(`rate_limit: ${errText.substring(0, 100)}`);
      if (res.status === 402) throw new Error(`credits_exhausted: ${errText.substring(0, 100)}`);
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || "",
      tokens_in: data.usage?.prompt_tokens || 0,
      tokens_out: data.usage?.completion_tokens || 0,
      finish_reason: choice?.finish_reason || "stop",
      tool_calls: choice?.message?.tool_calls || undefined,
      raw: data,
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/** Anthropic Messages API → normalized response */
async function callAnthropic(
  apiKey: string,
  modelName: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
): Promise<{ content: string; tokens_in: number; tokens_out: number; finish_reason: string; raw: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  // Convert OpenAI-style messages to Anthropic format
  const systemMsg = messages.find(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  try {
    const res = await meteredFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: maxTokens,
        temperature,
        ...(systemMsg ? { system: systemMsg.content } : {}),
        messages: nonSystemMessages,
      }),
      signal: controller.signal,
    }, { source: "llm-router:anthropic", category: "llm", metadata: { model: modelName } });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      if (res.status === 429) throw new Error(`rate_limit: ${errText.substring(0, 100)}`);
      if (res.status === 402 || res.status === 400) throw new Error(`credits_or_billing: ${errText.substring(0, 100)}`);
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    const content = data.content?.map((c: any) => c.text || "").join("") || "";

    return {
      content,
      tokens_in: data.usage?.input_tokens || 0,
      tokens_out: data.usage?.output_tokens || 0,
      finish_reason: data.stop_reason || "end_turn",
      raw: data,
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Ollama direct — FORGE v1 (no VPS Celery). Uses OLLAMA_URL / OLLAMA_BASE_URL.
 */
async function callOllamaDirect(
  modelName: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  maxPollMs: number = 55_000,
): Promise<{ content: string; tokens_in: number; tokens_out: number; finish_reason: string; raw: any }> {
  const bareModel = modelName.replace(":latest", "").trim().replace(/^ollama\//, "");
  const base = (Deno.env.get("OLLAMA_URL") || Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434").replace(/\/$/, "");

  const res = await meteredFetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: bareModel,
      messages,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    }),
    signal: AbortSignal.timeout(maxPollMs),
  }, { source: "llm-router:ollama-direct", category: "ollama", metadata: { model: bareModel } });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    throw new Error(`Ollama direct failed (${res.status}): ${errText.substring(0, 200)}`);
  }

  const data = await res.json();
  return {
    content: data.message?.content || "",
    tokens_in: data.prompt_eval_count || 0,
    tokens_out: data.eval_count || 0,
    finish_reason: data.done_reason || "stop",
    raw: data,
  };
}

// ═══════════════════════════════════════════════════════════
// xAI MULTI-AGENT — /v1/responses ADAPTER
// ═══════════════════════════════════════════════════════════

const XAI_RESPONSES_MODELS = new Set([
  "grok-4.20-multi-agent-0309",
]);

function isXaiResponsesModel(modelName: string): boolean {
  return XAI_RESPONSES_MODELS.has(modelName);
}

/** Call xAI /v1/responses endpoint for multi-agent models and normalize output */
async function callXaiResponses(
  apiKey: string,
  modelName: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  tools?: LLMRequest["tools"],
  toolChoice?: LLMRequest["tool_choice"],
): Promise<{ content: string; tokens_in: number; tokens_out: number; finish_reason: string; tool_calls?: any[]; raw: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const body: Record<string, unknown> = {
      model: modelName,
      input: messages,
      temperature,
      max_output_tokens: maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = toolChoice || "auto";
    }

    const res = await meteredFetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }, { source: "llm-router:xai-responses", category: "llm", metadata: { model: modelName } });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      if (res.status === 429) throw new Error(`rate_limit: ${errText.substring(0, 100)}`);
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    
    // Normalize /v1/responses output to standard format
    const outputItems = data.output || [];
    let content = "";
    for (const item of outputItems) {
      if (item.type === "message" && item.content) {
        for (const block of item.content) {
          if (block.type === "output_text") {
            content += block.text || "";
          }
        }
      }
    }

    return {
      content,
      tokens_in: data.usage?.input_tokens || 0,
      tokens_out: data.usage?.output_tokens || 0,
      finish_reason: data.status === "completed" ? "stop" : (data.status || "stop"),
      raw: data,
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN ROUTER
// ═══════════════════════════════════════════════════════════

/**
 * Universal LLM Router — Routes to any provider based on model_id.
 * No automatic fallback — if the chosen model fails, error is returned explicitly.
 */
/** Fire-and-forget cost/usage logging to ai_usage_logs (was previously never written). */
function logAiUsage(row: Record<string, unknown>): void {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  void fetch(`${url}/rest/v1/ai_usage_logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(row),
  }).catch(() => { /* telemetry must never break the caller */ });
}

export async function routeLLM(request: LLMRequest): Promise<LLMResponse> {
  const startTime = Date.now();

  // 1. Resolve model
  const resolved = resolveModelForAPI(request.model_id);
  if (!resolved) {
    throw new Error(`Model not found in catalog: ${request.model_id}`);
  }

  const { provider, modelName } = resolved;
  const temperature = request.temperature ?? 0.7;
  const maxTokens = request.max_tokens ?? 32768;

  const endpointMode = (provider === "xai" && isXaiResponsesModel(modelName)) ? "responses" : "chat_completions";
  console.log(`[llm-router] Routing ${request.model_id} → provider=${provider} model=${modelName} endpoint_mode=${endpointMode}`);

  let result: { content: string; tokens_in: number; tokens_out: number; finish_reason: string; tool_calls?: any[]; raw: any };

  // 2. Route to provider
  try {
  if (provider === "ollama") {
    // ═══ AUTHORITY GATE: Only Motor de Potência authorized models may execute ═══
    const authorized = await getAuthorizedOllamaModels(request.authority_slot, request.authority_user_id);
    if (!authorized.has(modelName)) {
      throw new Error(
        `[OLLAMA-AUTHORITY-GATE] Modelo "${modelName}" não autorizado ` +
        `(slot=${request.authority_slot || "none"}, user=${request.authority_user_id || "none"}). ` +
        `Autorizados: [${[...authorized].join(", ")}].`
      );
    }
    result = await callOllamaDirect(modelName, request.messages, temperature, maxTokens, request.maxPollMs ?? 55_000);
  } else if (provider === "anthropic") {
    const apiKey = await resolveApiKey(provider, modelName, request.tenant_id);
    result = await callAnthropic(apiKey, modelName, request.messages, temperature, maxTokens);
  } else if (provider === "xai" && isXaiResponsesModel(modelName)) {
    // xAI multi-agent models → /v1/responses endpoint
    const apiKey = await resolveApiKey(provider, modelName, request.tenant_id);
    result = await callXaiResponses(apiKey, modelName, request.messages, temperature, maxTokens, request.tools, request.tool_choice);
  } else {
    // OpenAI-compatible providers: groq, xai, openai, lovable, google, openrouter, nvidia, perplexity
    const providerDef = findProvider(provider);
    const endpoint = providerDef?.endpoint;
    if (!endpoint) {
      throw new Error(`No endpoint configured for provider: ${provider}`);
    }

    const apiKey = await resolveApiKey(provider, modelName, request.tenant_id);
    result = await callOpenAICompatible(endpoint, apiKey, modelName, request.messages, temperature, maxTokens, undefined, 55000, request.tools, request.tool_choice);
  }
  } catch (err) {
    logAiUsage({
      user_id: request.authority_user_id ?? null,
      provider,
      feature: request.feature ?? "llm-router",
      model: modelName,
      tokens_input: 0,
      tokens_output: 0,
      tokens_total: 0,
      cost_usd: 0,
      latency_ms: Date.now() - startTime,
      success: false,
      error_message: String(err).slice(0, 500),
      metadata: { model_id: request.model_id },
    });
    throw err;
  }

  const latencyMs = Date.now() - startTime;
  const costCents = calculateCost(request.model_id, provider, result.tokens_in, result.tokens_out);

  console.log(`[llm-router] ✅ ${provider}/${modelName} — ${result.tokens_in}+${result.tokens_out} tokens, ${latencyMs}ms, $${(costCents / 100).toFixed(4)}${result.tool_calls ? ` [${result.tool_calls.length} tool_calls]` : ""}`);

  logAiUsage({
    user_id: request.authority_user_id ?? null,
    provider,
    feature: request.feature ?? "llm-router",
    model: modelName,
    tokens_input: result.tokens_in,
    tokens_output: result.tokens_out,
    tokens_total: result.tokens_in + result.tokens_out,
    cost_usd: costCents / 100,
    latency_ms: latencyMs,
    success: true,
    metadata: { model_id: request.model_id, finish_reason: result.finish_reason },
  });

  return {
    content: result.content,
    model: modelName,
    provider,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    latency_ms: latencyMs,
    cost_cents: costCents,
    finish_reason: result.finish_reason,
    tool_calls: result.tool_calls,
    raw: result.raw,
  };
}

// ═══════════════════════════════════════════════════════════
// HELPERS — Used by individual services
// ═══════════════════════════════════════════════════════════

/**
 * Check if a model_id routes to Ollama (direct API).
 * Used by services that need SSE heartbeats during Ollama polling.
 */
export function isOllamaModel(modelId: string): boolean {
  if (modelId.startsWith("ollama/")) return true;
  // FAIL-CLOSED: bare names without provider prefix are REJECTED, not assumed Ollama.
  // Only explicit "ollama/" prefix routes to local Ollama.
  return false;
}

/**
 * Convenience wrapper: prompt → text response.
 * Replaces ollamaGenerate() with full multi-provider routing.
 */
export async function generateLLM(options: {
  model_id: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  tenant_id?: string;
}): Promise<string> {
  const result = await routeLLM({
    model_id: options.model_id,
    messages: [{ role: "user", content: options.prompt }],
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    tenant_id: options.tenant_id,
  });
  return result.content;
}

/**
 * Convenience wrapper: returns LLMResponse adapted to AIProviderResponse format.
 * Used by triagem-inteligente and other services expecting the legacy format.
 */
export async function routeLLMAsProvider(request: LLMRequest): Promise<{
  choices: Array<{
    message: { role: string; content: string | null; tool_calls?: any[] };
    finish_reason: string;
  }>;
  model: string;
  provider_used: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  const result = await routeLLM(request);
  return {
    choices: [{
      message: { role: "assistant", content: result.content, tool_calls: undefined },
      finish_reason: result.finish_reason,
    }],
    model: result.model,
    provider_used: `${result.provider}/${result.model}`,
    usage: {
      prompt_tokens: result.tokens_in,
      completion_tokens: result.tokens_out,
      total_tokens: result.tokens_in + result.tokens_out,
    },
  };
}
