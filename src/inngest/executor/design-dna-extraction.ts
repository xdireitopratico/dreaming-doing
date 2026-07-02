import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import { normalizePresetId } from "@/lib/preset-contract";
import { getPresetById } from "@/lib/model-catalog";
import type { ModelTier } from "@/lib/model-catalog";
import { BUILTIN_RUNTIME } from "../../../supabase/functions/_shared/provider-wire.ts";
import { normalizeNvidiaApiModel } from "../../../supabase/functions/_shared/nvidia-model.ts";
import {
  CATEGORY_PROMPTS,
  MASTER_EXTRACTION_PROMPT,
  type ExtractionCategory,
} from "../../../supabase/functions/extract-design-dna/prompts.ts";
import type { LLmChatFn } from "./refero/llm-multi-pass.ts";

export type DesignDnaExtractionInput = {
  url: string;
  depth: "shallow" | "deep";
  categories: string[];
  userId: string;
  sandboxId?: string;
  sandboxAccessToken?: string;
};

export type DesignDnaExtractionResult = {
  dna: Record<string, unknown> | null;
  rawMarkdown: string;
  cleanMarkdown: string;
  rawHtml: string;
  cleanHtml: string;
  contentHygiene: {
    title: string;
    rootSelector: string;
    rawMarkdownChars: number;
    cleanMarkdownChars: number;
    rawHtmlChars: number;
    cleanHtmlChars: number;
  };
  screenshotUrl: string;
  screenshotBase64?: string;
  screenshots: string[];
  providerTrace: string[];
  confidence: number;
  notes: string[];
  blockedReason: string | null;
  /** DNA rejeitado pelo validador estrutural (score < 40/100). */
  validationRejected?: boolean;
  validationScore?: number;
};

export type LLMConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
  /** Protocolo de transporte HTTP — dispatch em llmExtractDNA. */
  protocol: "openai" | "anthropic" | "gemini";
};

type WebSecrets = Record<string, string>;

function parseTokenField(tokenField: string | null | undefined): string[] {
  if (!tokenField?.trim()) return [];
  const trimmed = tokenField.trim();
  if (!trimmed.startsWith("[")) return [trimmed];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    }
  } catch {
    /* single token */
  }
  return [trimmed];
}

function safeJsonParse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}



export async function loadWebSecrets(supabase: SupabaseClient, userId: string): Promise<WebSecrets> {
  const secrets: WebSecrets = {};

  const envFallbacks: Record<string, string | undefined> = {
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    BROWSERLESS_API_KEY: process.env.BROWSERLESS_API_KEY,
    BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    SERPER_API_KEY: process.env.SERPER_API_KEY,
    SERPER_KEY: process.env.SERPER_KEY,
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,
    BRAVE_API_KEY: process.env.BRAVE_API_KEY,
  };
  for (const [key, value] of Object.entries(envFallbacks)) {
    if (typeof value === "string" && value.trim()) secrets[key] = value.trim();
  }

  const { data } = await supabase
    .from("connectors")
    .select("provider, token_encrypted, kind")
    .eq("owner_id", userId)
    .in("kind", ["web_search", "web_scrape", "browser_runtime"])
    .order("updated_at", { ascending: false })
    .limit(20);

  const providerKeyMap: Record<string, string> = {
    brave: "BRAVE_SEARCH_API_KEY",
    tavily: "TAVILY_API_KEY",
    serper: "SERPER_API_KEY",
    firecrawl: "FIRECRAWL_API_KEY",
    browserless: "BROWSERLESS_API_KEY",
    browserbase: "BROWSERBASE_API_KEY",
    exa: "EXA_API_KEY",
    parallel: "PARALLEL_API_KEY",
    crawl4ai: "CRAWL4AI_API_KEY",
    scrapegraphai: "SCRAPEGRAPHAI_API_KEY",
    "browser-use": "BROWSER_USE_API_KEY",
  };

  for (const row of data ?? []) {
    const provider = String((row as { provider?: string | null }).provider ?? "").trim();
    const token = parseTokenField((row as { token_encrypted?: string | null }).token_encrypted)[0];
    const keyName = providerKeyMap[provider];
    if (keyName && token) secrets[keyName] = token;
  }

  return secrets;
}

export type ResolvedLLM = LLMConfig & {
  /** Caminho usado para resolver (auditoria + aviso de fallback). */
  resolvedFrom:
    | "connectors"
    | "preferences.fixed"
    | "preferences.robin"
    | "preferences.fixed.custom"
    | "capabilities.g1"
    | "env";
};

type LlmKind = string;

/** Map provider id → label humano (espelha ai-provider-registry.ts). */
const LLM_LABEL: Record<string, string> = {
  alibaba: "Alibaba (DashScope)",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  gemini: "Google Gemini",
  groq: "Groq",
  minimax: "MiniMax",
  moonshotai: "Moonshot (Kimi)",
  nvidia: "NVIDIA NIM",
  ollama: "Ollama",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  xai: "xAI (Grok)",
  xiaomi: "Xiaomi (MiMo)",
};

/** Default model por provider — usado quando o user não cadastrou modelo fixo. */
const LLM_DEFAULT_MODEL: Record<string, string> = {
  alibaba: "qwen-plus",
  anthropic: "claude-3-5-sonnet-latest",
  deepseek: "deepseek-chat",
  gemini: "gemini-1.5-flash",
  groq: "llama-3.1-8b-instant",
  minimax: "MiniMax-M3",
  moonshotai: "moonshot-v1-8k",
  nvidia: "meta/llama-3.1-70b-instruct",
  ollama: "llama3.1",
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  xai: "grok-2-latest",
  xiaomi: "mimo-v2",
};

/** Carrega agent_preferences do user (SSOT: profiles.agent_preferences). */
export async function loadAgentPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  mode?: "auto" | "robin" | "rob" | "fixed";
  poolProvider?: string;
  fixedPresetId?: string;
  customModelId?: string;
  useCustomModel?: boolean;
  autoAllowedPresetIds?: string[];
  userModelEntries?: Array<{ slug: string; env: string; label?: string }>;
  webScrapeProvider?: string;
  webScrapeFallback?: string;
  webSearchProvider?: string;
  webSearchFallback?: string;
  browserRuntimeProvider?: string;
  browserFallback?: string;
} | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("agent_preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  const raw = (data as { agent_preferences?: unknown } | null)?.agent_preferences;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const modeRaw = r.mode === "rob" ? "robin" : r.mode;
  const mode =
    modeRaw === "auto" || modeRaw === "robin" || modeRaw === "fixed"
      ? (modeRaw as "auto" | "robin" | "fixed")
      : undefined;
  const userModelEntries = Array.isArray(r.userModelEntries)
    ? (r.userModelEntries as Array<Record<string, unknown>>)
        .filter(
          (e): e is { slug: string; env: string; label?: string } =>
            !!e && typeof e.slug === "string" && typeof e.env === "string",
        )
        .map((e) => ({
          slug: e.slug,
          env: e.env,
          label: typeof e.label === "string" ? e.label : undefined,
        }))
    : undefined;
  return {
    mode,
    poolProvider: typeof r.poolProvider === "string" ? r.poolProvider : undefined,
    fixedPresetId: typeof r.fixedPresetId === "string" ? r.fixedPresetId : undefined,
    customModelId: typeof r.customModelId === "string" ? r.customModelId : undefined,
    useCustomModel: r.useCustomModel === true,
    autoAllowedPresetIds: Array.isArray(r.autoAllowedPresetIds)
      ? (r.autoAllowedPresetIds as string[]).filter((id) => typeof id === "string" && id.trim().length > 0)
      : undefined,
    userModelEntries: userModelEntries && userModelEntries.length > 0 ? userModelEntries : undefined,
    webScrapeProvider: typeof r.webScrapeProvider === "string" ? r.webScrapeProvider : undefined,
    webScrapeFallback: typeof r.webScrapeFallback === "string" ? r.webScrapeFallback : undefined,
    webSearchProvider: typeof r.webSearchProvider === "string" ? r.webSearchProvider : undefined,
    webSearchFallback: typeof r.webSearchFallback === "string" ? r.webSearchFallback : undefined,
    browserRuntimeProvider:
      typeof r.browserRuntimeProvider === "string" ? r.browserRuntimeProvider : undefined,
    browserFallback: typeof r.browserFallback === "string" ? r.browserFallback : undefined,
  };
}

/** Extrai provider id (BUILTIN_RUNTIME key ou custom-*) e token de uma row de connector. */
function readConnectorProvider(row: {
  kind?: string | null;
  provider?: string | null;
  token_encrypted?: string | null;
}): { provider: LlmKind; token: string } | null {
  const kind = String(row.kind ?? "").trim();
  const provider = String(row.provider ?? kind).trim() as LlmKind;
  const token = parseTokenField(row.token_encrypted ?? null)[0];
  if (!token) return null;
  return { provider, token };
}

/** Infere o protocolo de transporte a partir do provider id. */
function protocolForProvider(provider: LlmKind): "openai" | "anthropic" | "gemini" {
  if (provider === "anthropic") return "anthropic";
  if (provider === "gemini") return "gemini";
  return "openai";
}

/** Monta ResolvedLLM a partir de um provider+token+meta, com baseUrl do BUILTIN_RUNTIME ou meta. */
function buildLlmConfig(
  provider: LlmKind,
  token: string,
  meta: { baseUrl?: string; defaultModel?: string } = {},
  fallbackModel?: string,
  resolvedFrom: ResolvedLLM["resolvedFrom"] = "connectors",
): ResolvedLLM | null {
  if (provider === "ollama") {
    const base = String(meta.baseUrl ?? "")
      .trim()
      .replace(/\/$/, "");
    if (!base) return null;
    const model = String(meta.defaultModel ?? fallbackModel ?? "llama3.1").trim();
    return {
      apiKey: "ollama",
      baseUrl: base,
      model,
      label: LLM_LABEL.ollama ?? "Ollama",
      protocol: "openai",
      resolvedFrom,
    };
  }

  if (provider.startsWith("custom-")) {
    const specBase = String(meta.baseUrl ?? "")
      .trim()
      .replace(/\/$/, "");
    if (!specBase) return null;
    const model = String(meta.defaultModel ?? fallbackModel ?? "").trim();
    if (!model) return null;
    return {
      apiKey: token,
      baseUrl: specBase,
      model,
      label: provider,
      protocol: "openai",
      resolvedFrom,
    };
  }

  const spec = BUILTIN_RUNTIME[provider];
  if (!spec?.baseUrl) return null;
  const baseUrl = String(meta.baseUrl ?? spec.baseUrl)
    .trim()
    .replace(/\/$/, "");
  const model = String(
    meta.defaultModel ?? fallbackModel ?? LLM_DEFAULT_MODEL[provider] ?? "",
  ).trim();
  if (!model) return null;
  return {
    apiKey: token,
    baseUrl,
    model,
    label: LLM_LABEL[provider] ?? provider,
    protocol: protocolForProvider(provider),
    resolvedFrom,
  };
}

/**
 * Resolve a config de LLM respeitando exclusivamente o que o usuário configurou
 * em /api-models (profiles.agent_preferences + connectors).
 *
 * Hierarquia (sem fallback):
 *   1. mode === "fixed"  → fixedPresetId ou customModelId
 *   2. mode === "robin"  → poolProvider (groq/nvidia)
 *   3. mode === "auto"   → autoAllowedPresetIds (1–5 presets), routing por complexidade
 *
 * FAIL-CLOSED: se a configuração do modo não resolver, retorna null.
 * NUNCA inventa combinação chave+endpoint. NUNCA usa outro modelo sem
 * conhecimento explícito do usuário. Se o LLM falhar, a operação falha.
 */
export async function resolveLLMConfig(
  supabase: SupabaseClient,
  userId: string,
  complexity: "low" | "medium" | "high" = "medium",
): Promise<ResolvedLLM | null> {
  const { data } = await supabase
    .from("connectors")
    .select("kind, provider, token_encrypted, meta")
    .eq("owner_id", userId)
    .not("token_encrypted", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Array<{
    kind?: string | null;
    provider?: string | null;
    token_encrypted?: string | null;
    meta?: Record<string, unknown> | null;
  }>;

  const metaOf = (row: (typeof rows)[number]) =>
    (row.meta ?? {}) as { baseUrl?: string; defaultModel?: string };

  const findConnector = (provider: LlmKind) =>
    rows
      .map((row) => {
        const r = readConnectorProvider(row);
        return r && r.provider === provider ? { ...r, meta: metaOf(row) } : null;
      })
      .find(
        (
          x,
        ): x is {
          provider: LlmKind;
          token: string;
          meta: { baseUrl?: string; defaultModel?: string };
        } => x !== null,
      );

  const prefs = await loadAgentPreferences(supabase, userId);

  // 1) mode === "fixed" → fixedPresetId ou customModelId
  if (prefs?.mode === "fixed") {
    const presetId =
      prefs.customModelId && prefs.useCustomModel ? prefs.customModelId : prefs.fixedPresetId;
    if (presetId) {
      const normalized = normalizePresetId(presetId);
      const sepIdx = normalized.indexOf("--");
      const env = sepIdx !== -1 ? normalized.slice(0, sepIdx) : normalized;
      const model = sepIdx !== -1 ? normalized.slice(sepIdx + 2) : normalized;
      const connector = findConnector(env as LlmKind);
      if (connector) {
        const cfg = buildLlmConfig(
          connector.provider,
          connector.token,
          { ...connector.meta, defaultModel: model },
          model,
          "preferences.fixed",
        );
        if (cfg) return cfg;
      }
      // custom → resolved via userModelEntries
      if (env === "custom") {
        const slugToFind = model.replace(/--/g, "/");
        const entry = prefs.userModelEntries?.find((e) => e.slug === slugToFind);
        if (entry) {
          const c = findConnector(entry.env as LlmKind);
          if (c) {
            const cfg = buildLlmConfig(
              c.provider,
              c.token,
              { ...c.meta, defaultModel: entry.slug },
              entry.slug,
              "preferences.fixed.custom",
            );
            if (cfg) return cfg;
          }
        }
      }
    }
    // FAIL-CLOSED: modo fixed sem preset configurado ou sem connector = null
    return null;
  }

  // 2) mode === "robin"/"rob" → poolProvider (groq, nvidia, etc.)
  if (prefs?.mode === "robin") {
    if (!prefs.poolProvider) return null;
    const connector = findConnector(prefs.poolProvider as LlmKind);
    if (connector) {
      const cfg = buildLlmConfig(
        connector.provider,
        connector.token,
        connector.meta,
        undefined,
        "preferences.robin",
      );
      if (cfg) return cfg;
    }
    // FAIL-CLOSED: robin sem connector do pool = null
    return null;
  }

  // 3) mode === "auto" → autoAllowedPresetIds com routing por complexidade
  if (prefs?.mode === "auto") {
    const presetIds = prefs.autoAllowedPresetIds;
    if (!presetIds || presetIds.length === 0) return null;

    // Mapeia complexidade para tiers aceitáveis (ordem de preferência)
    const tierPriority: Record<string, ModelTier[]> = {
      high: ["frontier", "balanced", "fast", "pool"],
      medium: ["balanced", "frontier", "fast", "pool"],
      low: ["fast", "balanced", "frontier", "pool"],
    };
    const acceptableTiers = tierPriority[complexity];

    // Resolve cada preset ID → preset do catálogo
    const resolved = presetIds
      .map((id) => {
        const preset = getPresetById(id, prefs.userModelEntries);
        return { id, preset };
      })
      .filter((r) => r.preset.id !== "" && r.preset.id !== undefined);

    if (resolved.length === 0) return null;

    // Ordena por tier priority (mais adequado primeiro)
    resolved.sort((a, b) => {
      const aIdx = acceptableTiers.indexOf(a.preset.tier);
      const bIdx = acceptableTiers.indexOf(b.preset.tier);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    // Tenta o primeiro preset que tenha connector disponível
    for (const { preset } of resolved) {
      const env = preset.env as LlmKind;
      const connector = findConnector(env);
      if (connector) {
        const model = preset.model || undefined;
        const cfg = buildLlmConfig(
          connector.provider,
          connector.token,
          { ...connector.meta, defaultModel: model },
          model,
          "preferences.auto",
        );
        if (cfg) return cfg;
      }
    }
    // FAIL-CLOSED: nenhum dos presets selecionados pelo usuário tem connector
    return null;
  }

  // Sem modo configurado → FAIL-CLOSED
  return null;
}

/** Snapshot do LLM validado em G1 — usado para evitar drift no agente DEEP. */
export type G1ResolvedLlm = {
  model: string;
  label: string;
  /** Protocolo HTTP (openai / anthropic / gemini). */
  provider: string;
  /** Id do conector (connectors.provider): nvidia, groq, anthropic, … */
  connectorEnv: string;
  supportsVision: boolean;
};

/**
 * Resolve wire LLM usando exatamente o provider+model validados em G1.
 * Evita drift entre resolveExtractionCapabilities e resolveLLMConfig(auto/high).
 */
export async function resolveLlmConfigForG1Model(
  supabase: SupabaseClient,
  userId: string,
  g1Llm: G1ResolvedLlm,
): Promise<ResolvedLLM | null> {
  const { data } = await supabase
    .from("connectors")
    .select("kind, provider, token_encrypted, meta")
    .eq("owner_id", userId)
    .not("token_encrypted", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Array<{
    kind?: string | null;
    provider?: string | null;
    token_encrypted?: string | null;
    meta?: Record<string, unknown> | null;
  }>;

  const metaOf = (row: (typeof rows)[number]) =>
    (row.meta ?? {}) as { baseUrl?: string; defaultModel?: string };

  const findConnector = (provider: LlmKind) =>
    rows
      .map((row) => {
        const r = readConnectorProvider(row);
        return r && r.provider === provider ? { ...r, meta: metaOf(row) } : null;
      })
      .find(
        (
          x,
        ): x is {
          provider: LlmKind;
          token: string;
          meta: { baseUrl?: string; defaultModel?: string };
        } => x !== null,
      );

  const connectorEnv = g1Llm.connectorEnv?.trim() || g1Llm.provider;
  const connector = findConnector(connectorEnv);
  if (!connector) return null;

  const model =
    connectorEnv === "nvidia" ? normalizeNvidiaApiModel(g1Llm.model) : g1Llm.model;

  return buildLlmConfig(
    connector.provider,
    connector.token,
    { ...connector.meta, defaultModel: model },
    model,
    "capabilities.g1",
  );
}

/** Fail closed se o wire divergir do modelo validado em G1. */
export function assertLlmMatchesG1(wire: ResolvedLLM, g1Llm: G1ResolvedLlm): void {
  if (wire.model !== g1Llm.model) {
    throw new Error(
      `LLM drift (G1): gate validou "${g1Llm.model}" mas o agente resolveu "${wire.model}". ` +
        "Verifique API Models (/api-models) — o modelo do job DEEP deve ser o mesmo validado no gate.",
    );
  }
}


type ChatContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

function openAiChat(
  cfg: LLMConfig,
  systemPrompt: string,
  userContent: string,
  screenshot: string,
): Promise<{ content: string }> {
  const messages: Array<{ role: "system" | "user"; content: ChatContent }> = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: screenshot.startsWith("data:")
        ? [
            { type: "text", text: userContent },
            { type: "image_url", image_url: { url: screenshot } },
          ]
        : userContent,
    },
  ];
  return fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: 4096,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(120000),
  }).then(async (response) => {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `LLM extraction failed (${cfg.label} /chat/completions): HTTP ${response.status} — ${errText.slice(0, 400)}`,
      );
    }
    const data = await response.json();
    return { content: data.choices?.[0]?.message?.content || "{}" };
  });
}

function anthropicChat(
  cfg: LLMConfig,
  systemPrompt: string,
  userContent: string,
  screenshot: string,
): Promise<{ content: string }> {
  // Anthropic Messages API: system vai no top-level, user content em blocos.
  const hasImage = screenshot.startsWith("data:");
  const userBlocks: Array<Record<string, unknown>> = [{ type: "text", text: userContent }];
  if (hasImage) {
    const base64Match = screenshot.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (base64Match) {
      userBlocks.push({
        type: "image",
        source: { type: "base64", media_type: `image/${base64Match[1]}`, data: base64Match[2] },
      });
    }
  }
  return fetch(`${cfg.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      system: systemPrompt,
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{ role: "user", content: userBlocks }],
    }),
    signal: AbortSignal.timeout(120000),
  }).then(async (response) => {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `LLM extraction failed (${cfg.label} /messages): HTTP ${response.status} — ${errText.slice(0, 400)}`,
      );
    }
    const data = await response.json();
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks
      .map((b: { type?: string; text?: string }) => (b.type === "text" ? b.text : ""))
      .join("");
    return { content: text || "{}" };
  });
}

function geminiChat(
  cfg: LLMConfig,
  systemPrompt: string,
  userContent: string,
  screenshot: string,
): Promise<{ content: string }> {
  // Gemini generateContent: API key vai como ?key=, contents em parts, systemInstruction separado.
  const parts: Array<Record<string, unknown>> = [{ text: userContent }];
  if (screenshot.startsWith("data:")) {
    const base64Match = screenshot.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (base64Match) {
      parts.push({
        inline_data: { mime_type: `image/${base64Match[1]}`, data: base64Match[2] },
      });
    }
  }
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(120000),
  }).then(async (response) => {
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `LLM extraction failed (${cfg.label} generateContent): HTTP ${response.status} — ${errText.slice(0, 400)}`,
      );
    }
    const data = await response.json();
    const candidateParts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(candidateParts)
      ? candidateParts.map((p: { text?: string }) => p.text ?? "").join("")
      : "";
    return { content: text || "{}" };
  });
}

/** Dispatcher LLM para multiPassExtractDNA (openai / anthropic / gemini). */
export function createLlmChatDispatcher(cfg: LLMConfig): LLmChatFn {
  return (systemPrompt, userContent, screenshot) => {
    if (cfg.protocol === "anthropic") {
      return anthropicChat(cfg, systemPrompt, userContent, screenshot);
    }
    if (cfg.protocol === "gemini") {
      return geminiChat(cfg, systemPrompt, userContent, screenshot);
    }
    return openAiChat(cfg, systemPrompt, userContent, screenshot);
  };
}

async function llmExtractDNA(
  url: string,
  markdown: string,
  screenshot: string,
  categories: string[],
  isDeep: boolean,
  llmConfig: LLMConfig | null,
): Promise<Record<string, unknown> | null> {
  const categoryInstructions = categories
    .map((cat) => `### Categoria: ${cat}\n${CATEGORY_PROMPTS[cat as ExtractionCategory]}`)
    .join("\n\n---\n\n");

  const systemPrompt = `${MASTER_EXTRACTION_PROMPT}

## Modo: ${isDeep ? "DEEP (com CSS computado + motion traces)" : "SHALLOW (markdown + screenshot)"}

## Categorias a extrair
${categoryInstructions}

## IMPORTANTE
- Retorne UM JSON válido com todas as categorias combinadas
- layout, color, typography, motion, interaction, component como objects
- serves_domains, compatible_languages, compatible_moods como arrays
- quality_score: estime 0-10 baseado na riqueza de design observada
- Se não há evidência de algo, use null`;

  if (!llmConfig) {
    return null;
  }

  const userContent = `## Site: ${url}

### Markdown extraído:
${markdown.slice(0, 30000)}

### Screenshot: ${screenshot.startsWith("data:") ? "[imagem base64 anexada]" : screenshot}

Extraia o DesignDNA deste site.`;

  let rawContent: string;
  try {
    const result =
      llmConfig.protocol === "anthropic"
        ? await anthropicChat(llmConfig, systemPrompt, userContent, screenshot)
        : llmConfig.protocol === "gemini"
          ? await geminiChat(llmConfig, systemPrompt, userContent, screenshot)
          : await openAiChat(llmConfig, systemPrompt, userContent, screenshot);
    rawContent = result.content;
  } catch (err) {
    throw new Error(errorMessage(err));
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    const codeMatch = rawContent.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (codeMatch) {
      try { parsed = JSON.parse(codeMatch[1]); } catch { parsed = {}; }
    } else {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? safeJsonParse(jsonMatch[0]) : {};
    }
  }
  if (typeof parsed !== "object" || parsed === null || Object.keys(parsed).length === 0) {
    return null;
  }
  console.debug("[llmExtractDNA] keys received:", Object.keys(parsed), "quality_source:", parsed.quality_source);

  return {
    name: url,
    source_url: url,
    category: "full_page",
    serves_domains: (parsed.serves_domains as string[]) || [],
    compatible_languages: (parsed.compatible_languages as string[]) || [],
    compatible_moods: (parsed.compatible_moods as string[]) || [],
    layout: parsed.layout ?? null,
    color: parsed.color ?? parsed.color_application ?? null,
    typography: parsed.typography ?? null,
    motion: parsed.motion ?? null,
    interaction: parsed.interaction ?? parsed.interactions ?? null,
    component: parsed.component ?? parsed.component_patterns ?? null,
    implementation_notes: parsed.implementation_notes ?? null,
    quality_score: Math.min(10, Math.max(0, (parsed.quality_score as number) ?? (isDeep ? 7 : 5))),
    quality_source: isDeep ? "deep_extraction" : "shallow_extraction",
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}


/**
 * Extração SHALLOW canônica (Gate G3).
 * DEEP usa browser agent em run-design-dna.ts — não passa por aqui.
 */
export async function extractDesignDnaForUrl(
  supabase: SupabaseClient,
  input: DesignDnaExtractionInput,
): Promise<DesignDnaExtractionResult> {
  if (input.depth === "deep") {
    throw new Error(
      "extractDesignDnaForUrl é SHALLOW-only. Extração DEEP usa browser agent (run-design-dna).",
    );
  }
  const { runShallowExtraction } = await import("./shallow-extraction.ts");
  return runShallowExtraction(supabase, input);
}
