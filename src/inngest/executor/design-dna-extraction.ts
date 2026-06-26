import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import { cleanHtmlDocument, htmlToMarkdownDocument } from "@/lib/html-hygiene";
import { scrapeWebPage } from "../../../supabase/functions/_shared/web-research-providers.ts";
import { BUILTIN_RUNTIME } from "../../../supabase/functions/_shared/provider-wire.ts";
import { finalizeDocumentMarkdown } from "../../../supabase/functions/_shared/document-sanitize.ts";
import { buildPlaywrightScript } from "../../../supabase/functions/extract-design-dna/playwright-automation.ts";
import {
  CATEGORY_PROMPTS,
  MASTER_EXTRACTION_PROMPT,
  type ExtractionCategory,
} from "../../../supabase/functions/extract-design-dna/prompts.ts";

export type DesignDnaExtractionInput = {
  url: string;
  depth: "shallow" | "deep";
  categories: string[];
  userId: string;
  sandboxExecUrl?: string;
  sandboxToken?: string;
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
};

type LLMConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
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

function buildFallbackDna(url: string, reason: string): Record<string, unknown> {
  return {
    name: url,
    source_url: url,
    category: "full_page",
    serves_domains: [],
    compatible_languages: [],
    compatible_moods: [],
    layout: { type: "unknown" },
    color: null,
    typography: null,
    motion: null,
    interaction: null,
    component: null,
    implementation_notes: `Partial extraction — ${reason}`,
    quality_score: 3,
    quality_source: `heuristic (${reason})`,
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}

async function loadWebSecrets(supabase: SupabaseClient, userId: string): Promise<WebSecrets> {
  const secrets: WebSecrets = {};

  const envFallbacks: Record<string, string | undefined> = {
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    BROWSERLESS_API_KEY: process.env.BROWSERLESS_API_KEY,
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

type ResolvedLLM = LLMConfig & {
  /** Caminho usado para resolver (auditoria + aviso de fallback). */
  resolvedFrom: "connectors" | "preferences.fixed" | "preferences.robin" | "env";
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
async function loadAgentPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  mode?: "auto" | "robin" | "rob" | "fixed";
  poolProvider?: string;
  fixedPresetId?: string;
  customModelId?: string;
  useCustomModel?: boolean;
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
  return {
    mode,
    poolProvider: typeof r.poolProvider === "string" ? r.poolProvider : undefined,
    fixedPresetId: typeof r.fixedPresetId === "string" ? r.fixedPresetId : undefined,
    customModelId: typeof r.customModelId === "string" ? r.customModelId : undefined,
    useCustomModel: r.useCustomModel === true,
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
      resolvedFrom,
    };
  }

  if (provider === "anthropic") {
    // Anthropic Messages API é diferente do OpenAI-compatible — exigimos
    // o caminho próprio em vez de tentar mandar pro endpoint OpenAI.
    // Como o design-dna-extract hoje só fala OpenAI-compatible chat/completions,
    // retornamos null e o caller degrada para heuristic.
    return null;
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
    resolvedFrom,
  };
}

/**
 * Resolve a config de LLM respeitando exclusivamente o que o usuário configurou
 * em /api-models (profiles.agent_preferences + connectors).
 *
 * Hierarquia:
 *   1. preferences.mode === "fixed" + fixedPresetId/customModelId  → esse provider
 *   2. preferences.mode === "robin"/"rob" + poolProvider           → esse provider
 *   3. Senão: primeiro connector LLM cadastrado (ordem updated_at desc)
 *
 * FAIL-CLOSED: se nada bate, retorna null. NUNCA inventa combinação chave+endpoint.
 * Env vars só são usadas quando explicitamente salvas no connector — nunca
 * como fallback mágico cross-endpoint.
 */
async function resolveLLMConfig(
  supabase: SupabaseClient,
  userId: string,
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

  // 1) preferences.mode === "fixed" → fixedPresetId (formato: "<provider>/<model>" ou "<model>")
  if (prefs?.mode === "fixed") {
    const presetId =
      prefs.customModelId && prefs.useCustomModel ? prefs.customModelId : prefs.fixedPresetId;
    if (presetId) {
      const envMatch = presetId.match(/^([^/]+)\/(.+)$/);
      const env = envMatch ? envMatch[1] : presetId;
      const model = envMatch ? envMatch[2] : presetId;
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
    }
  }

  // 2) preferences.mode === "robin"/"rob" → poolProvider
  if (prefs?.mode === "robin" && prefs.poolProvider) {
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
  }

  // 3) Sem pref específica: usa o primeiro connector LLM com token (ordem updated_at desc)
  for (const row of rows) {
    const parsed = readConnectorProvider(row);
    if (!parsed) continue;
    if (parsed.provider === "e2b") continue; // E2B não é LLM
    const cfg = buildLlmConfig(parsed.provider, parsed.token, metaOf(row));
    if (cfg) return cfg;
  }

  return null;
}

async function execPlaywrightInSandbox(
  url: string,
  sandboxExecUrl: string,
  sandboxToken?: string,
): Promise<{
  markdown: string;
  css_computed: string;
  motion_traces: string;
  color_scheme?: string;
  screenshots?: string[];
  screenshot_base64?: string;
  page_height?: number;
}> {
  const script = buildPlaywrightScript(url);
  const response = await fetch(sandboxExecUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sandboxToken ? { Authorization: `Bearer ${sandboxToken}` } : {}),
    },
    body: JSON.stringify({ command: "node -e", stdin: script, timeout: 120000 }),
    signal: AbortSignal.timeout(150000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Sandbox exec failed: HTTP ${response.status} — ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.output || data.stdout || "{}");
  return {
    markdown: result.markdown ?? "",
    css_computed: result.css_computed ?? "[]",
    motion_traces: result.motion_traces ?? "[]",
    color_scheme: result.color_scheme ?? "{}",
    screenshots: result.screenshots ?? [],
    screenshot_base64: result.screenshots?.[0],
    page_height: result.page_height,
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

  const messages = [
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

  const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages,
      max_tokens: 4096,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`LLM extraction failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "{}";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  return {
    name: url,
    source_url: url,
    category: "full_page",
    serves_domains: (parsed.serves_domains as string[]) || [],
    compatible_languages: (parsed.compatible_languages as string[]) || [],
    compatible_moods: (parsed.compatible_moods as string[]) || [],
    layout: parsed.layout ?? null,
    color: parsed.color ?? null,
    typography: parsed.typography ?? null,
    motion: parsed.motion ?? null,
    interaction: parsed.interaction ?? null,
    component: parsed.component ?? null,
    implementation_notes: parsed.implementation_notes ?? null,
    quality_score: Math.min(10, Math.max(0, (parsed.quality_score as number) ?? (isDeep ? 7 : 5))),
    quality_source: isDeep ? "deep_extraction" : "shallow_extraction",
    extracted_at: new Date().toISOString(),
    validated: false,
  };
}

export async function extractDesignDnaForUrl(
  supabase: SupabaseClient,
  input: DesignDnaExtractionInput,
): Promise<DesignDnaExtractionResult> {
  const [webSecrets, resolvedLlm, prefs] = await Promise.all([
    loadWebSecrets(supabase, input.userId),
    resolveLLMConfig(supabase, input.userId),
    loadAgentPreferences(supabase, input.userId),
  ]);
  const llmConfig: LLMConfig | null = resolvedLlm
    ? {
        apiKey: resolvedLlm.apiKey,
        baseUrl: resolvedLlm.baseUrl,
        model: resolvedLlm.model,
        label: resolvedLlm.label,
      }
    : null;

  const providerTrace: string[] = [];
  const notes: string[] = [];

  // T5: aviso se LLM não pôde ser resolvido
  if (!resolvedLlm) {
    notes.push(
      "⚠️ no LLM connector configured in /api-models — using heuristic DNA fallback (quality 3/10). Configure LLM to improve extraction.",
    );
  } else {
    providerTrace.push(`llm:${resolvedLlm.label} (${resolvedLlm.resolvedFrom})`);
  }

  // T4: respeita a preferência de web_scrape do /api-models.
  // Sem pref explícita + sem connector salvo, default é "jina" (free-by-default).
  // Fallback default: se primário != jina, jina; se jina, http.
  const scrapeProvider = prefs?.webScrapeProvider ?? "jina";
  const scrapeFallback = prefs?.webScrapeFallback
    ? prefs.webScrapeFallback
    : scrapeProvider === "jina"
      ? "http"
      : "jina";

  const markdownRes = await scrapeWebPage(
    {
      url: input.url,
      format: "markdown",
      mode: "read",
      provider: scrapeProvider,
      only_main_content: true,
    },
    webSecrets,
    { primary: scrapeProvider, fallback: scrapeFallback },
  );
  providerTrace.push(
    `markdown:${String(markdownRes.provider ?? "unknown")}${markdownRes.provider !== scrapeProvider ? `(fallback from ${scrapeProvider})` : ""}`,
  );
  if (markdownRes.provider && markdownRes.provider !== scrapeProvider) {
    notes.push(
      `⚠️ primary web_scrape '${scrapeProvider}' failed — fell back to '${markdownRes.provider}' (configured in /api-models).`,
    );
  }

  const htmlRes = await scrapeWebPage(
    {
      url: input.url,
      format: "html",
      mode: "read",
      provider: scrapeProvider,
      only_main_content: false,
    },
    webSecrets,
    { primary: scrapeProvider, fallback: scrapeFallback },
  );
  providerTrace.push(
    `html:${String(htmlRes.provider ?? "unknown")}${htmlRes.provider !== scrapeProvider ? `(fallback from ${scrapeProvider})` : ""}`,
  );
  if (htmlRes.provider && htmlRes.provider !== scrapeProvider) {
    notes.push(
      `⚠️ primary web_scrape '${scrapeProvider}' failed for HTML — fell back to '${htmlRes.provider}'.`,
    );
  }

  const rawMarkdown = String(markdownRes.content ?? "").trim();
  const rawHtml = String(htmlRes.content ?? "").trim();
  const cleaned = cleanHtmlDocument(rawHtml);
  const cleanHtml = cleaned.cleanHtml;
  const cleanText = cleaned.cleanText;
  const cleanMarkdown = htmlToMarkdownDocument(rawHtml);
  const cleanedMarkdown = finalizeDocumentMarkdown(cleanMarkdown || cleanText, {
    maxChars: 24_000,
  }).markdown;
  const contentHygiene = {
    title: cleaned.title,
    rootSelector: cleaned.rootSelector,
    rawMarkdownChars: rawMarkdown.length,
    cleanMarkdownChars: cleanedMarkdown.length,
    rawHtmlChars: rawHtml.length,
    cleanHtmlChars: cleanHtml.length,
  };

  let enrichedMarkdown = rawMarkdown || cleanedMarkdown;
  let screenshots: string[] = [];
  let screenshotBase64 = "";
  let screenshotUrl = `https://image.thum.io/get/width/1280/crop/720/fullpage/${encodeURIComponent(input.url)}`;
  let blockedReason: string | null = null;

  if (input.depth === "deep" && input.sandboxExecUrl) {
    try {
      const playwrightData = await execPlaywrightInSandbox(
        input.url,
        input.sandboxExecUrl,
        input.sandboxToken,
      );
      providerTrace.push("sandbox:playwright");
      enrichedMarkdown = [
        playwrightData.markdown,
        cleanedMarkdown,
        `\n\n## CSS Computado (sections principais)\n${playwrightData.css_computed}`,
        `\n\n## Motion Traces\n${playwrightData.motion_traces}`,
        playwrightData.color_scheme ? `\n\n## Color Scheme\n${playwrightData.color_scheme}` : "",
        playwrightData.page_height
          ? `\n\n## Page Metrics\n- Full page height: ${playwrightData.page_height}px`
          : "",
      ].join("");

      screenshots = playwrightData.screenshots ?? [];
      screenshotBase64 = screenshots[0] ?? playwrightData.screenshot_base64 ?? "";
      screenshotUrl = screenshotBase64
        ? `data:image/png;base64,${screenshotBase64}`
        : screenshotUrl;
      notes.push("deep sandbox extraction completed");
    } catch (err) {
      const msg = errorMessage(err);
      notes.push(`deep sandbox extraction failed: ${msg}`);
      providerTrace.push("sandbox:error");
      if (!rawMarkdown.trim() && !cleanHtml.trim() && !cleanedMarkdown.trim()) {
        blockedReason = msg;
      }
    }
  } else if (input.depth === "deep") {
    notes.push("sandbox unavailable, deep request downgraded to web scrape");
    if (!rawMarkdown.trim() && !cleanHtml.trim() && !cleanedMarkdown.trim()) {
      blockedReason = "sandbox unavailable for deep extraction";
    }
  }

  if (!enrichedMarkdown.trim()) {
    notes.push("markdown empty after scrape");
  }

  const density = Math.min(
    1,
    (enrichedMarkdown.length + cleanHtml.length + cleanText.length + cleanedMarkdown.length) /
      50000,
  );
  let confidence =
    input.depth === "deep"
      ? Math.round(60 + density * 35 + (screenshots.length > 0 ? 5 : 0))
      : Math.round(35 + density * 35 + (screenshotBase64 ? 5 : 0));

  if (blockedReason) {
    confidence = Math.min(confidence, 25);
  }

  const dna = await llmExtractDNA(
    input.url,
    enrichedMarkdown.slice(0, 30000),
    screenshotUrl,
    input.categories,
    input.depth === "deep" && screenshots.length > 0,
    llmConfig,
  );

  const finalDna =
    dna ??
    buildFallbackDna(input.url, llmConfig ? "LLM extraction unavailable" : "no LLM key available");

  if (!llmConfig) {
    notes.push("no LLM config available; using heuristic fallback");
  }

  if (
    (finalDna.quality_score as number | undefined) !== undefined &&
    (finalDna.quality_score as number) <= 3
  ) {
    notes.push("low-confidence output");
  }

  return {
    dna: finalDna,
    rawMarkdown,
    cleanMarkdown: cleanedMarkdown,
    rawHtml,
    cleanHtml,
    contentHygiene,
    screenshotUrl,
    screenshotBase64: screenshotBase64 || undefined,
    screenshots,
    providerTrace,
    confidence,
    notes,
    blockedReason,
  };
}
