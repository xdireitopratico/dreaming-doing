import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import { cleanHtmlDocument, htmlToMarkdownDocument } from "@/lib/html-hygiene";
import { normalizePresetId } from "@/lib/preset-contract";
import { getPresetById } from "@/lib/model-catalog";
import type { ModelTier } from "@/lib/model-catalog";
import { scrapeWebPage } from "../../../supabase/functions/_shared/web-research-providers.ts";
import { BUILTIN_RUNTIME } from "../../../supabase/functions/_shared/provider-wire.ts";
import { finalizeDocumentMarkdown } from "../../../supabase/functions/_shared/document-sanitize.ts";
import { runInSandbox } from "./e2b-client";
import {
  CATEGORY_PROMPTS,
  MASTER_EXTRACTION_PROMPT,
  type ExtractionCategory,
} from "../../../supabase/functions/extract-design-dna/prompts.ts";
import { referoScrape } from "./refero/refero-router.ts";
import { validateDNA } from "./refero/dna-validator.ts";
import type { ReferoScrapeResult } from "./refero/refero-types.ts";
import { multiPassExtractDNA, type LLmChatFn } from "./refero/llm-multi-pass.ts";

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
};

type LLMConfig = {
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



async function loadWebSecrets(supabase: SupabaseClient, userId: string): Promise<WebSecrets> {
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

type ResolvedLLM = LLMConfig & {
  /** Caminho usado para resolver (auditoria + aviso de fallback). */
  resolvedFrom: "connectors" | "preferences.fixed" | "preferences.robin" | "preferences.fixed.custom" | "env";
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
async function resolveLLMConfig(
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

export type PythonAgentResult = {
  markdown: string;
  colors: Record<string, unknown>;
  typography: Record<string, unknown>;
  spacing: Record<string, unknown>;
  css_custom_properties: Record<string, string>;
  animations: unknown[];
  transitions: unknown[];
  layout_classes: unknown[];
  viewport: { width: number; height: number; devicePixelRatio: number; scrollHeight: number };
  screenshot_base64: string;
  screenshot_full_base64: string;
  screenshots: string[];
};

export async function ensurePythonAgentInSandbox(
  sandboxId: string,
  accessToken: string | null,
): Promise<void> {
  const script = `cat > /opt/forge/agent.py << 'PYEOF'
import argparse, asyncio, base64, json, os, sys, traceback, urllib.request, urllib.error

def get_ws_endpoint(cdp_port):
    url = f"http://127.0.0.1:{cdp_port}/json/version"
    try:
        resp = urllib.request.urlopen(url, timeout=5)
        return json.loads(resp.read().decode())["webSocketDebuggerUrl"]
    except Exception as e:
        print(f"WARNING: failed to get CDP endpoint: {e}", file=sys.stderr)
        return None

def build_sampler_js():
    return '''() => {
  const r = { colors: {}, typography: {}, spacing: {}, css_custom_properties: {}, animations: [], transitions: [], layout_classes: [], viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio, scrollHeight: document.documentElement.scrollHeight } };
  const rs = getComputedStyle(document.documentElement);
  for (let i = 0; i < rs.length; i++) { const n = rs[i]; if (n.startsWith("--")) r.css_custom_properties[n] = rs.getPropertyValue(n).trim(); }
  for (const sel of ["h1","h2","h3","h4","h5","h6","p","a","button","nav","header","footer","section","main",'[class*="hero"]','[class*="card"]','[class*="container"]',"input","ul","ol","li","blockquote","code","pre"]) {
    for (const el of document.querySelectorAll(sel)) {
      if (!el.isConnected) continue;
      const cs = getComputedStyle(el); const t = el.tagName.toLowerCase();
      if (!r.colors[t]) r.colors[t] = { color: cs.color, backgroundColor: cs.backgroundColor, borderColor: cs.borderColor };
      if (!r.typography[t]) r.typography[t] = { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform };
      if (!r.spacing[t]) r.spacing[t] = { margin: cs.margin, padding: cs.padding, gap: cs.gap };
    }
  }
  for (const el of document.querySelectorAll("body > *, main, section, div[class*='grid'], div[class*='flex']")) {
    const cs = getComputedStyle(el); r.layout_classes.push({ tag: el.tagName.toLowerCase(), classes: (el.className||"").slice(0,200), display: cs.display, gridTemplateColumns: cs.gridTemplateColumns, gap: cs.gap, flexDirection: cs.flexDirection, justifyContent: cs.justifyContent, alignItems: cs.alignItems, maxWidth: cs.maxWidth });
  }
  try { for (const s of document.styleSheets) { try { for (const rule of (s.cssRules||s.rules||[])) { if (rule.type === CSSRule.KEYFRAMES_RULE) r.animations.push({ name: rule.name, keyframes: Array.from(rule.cssRules).map(k=>({key:k.keyText,style:k.style.cssText})) }); if (rule.type === CSSRule.STYLE_RULE && rule.style) { const an = rule.style.animationName; const tr = rule.style.transitionProperty; if (an && an !== "none") r.animations.push({ selector: rule.selectorText, animationName: an, duration: rule.style.animationDuration, timing: rule.style.animationTimingFunction }); if (tr && tr !== "none") r.transitions.push({ selector: rule.selectorText, property: tr, duration: rule.style.transitionDuration, timing: rule.style.transitionTimingFunction }); } } } catch(e) {} } } catch(e) {}
  return r;
}'''

async def extract_markdown(page):
    return await page.evaluate('''() => {
  function w(n,d) {
    if (!n||n.nodeType===Node.COMMENT_NODE) return "";
    if (n.nodeType===Node.TEXT_NODE) { const t=n.textContent.trim(); return t?t+" ":""; }
    const tag=(n.tagName||"").toLowerCase();
    if (["script","style","noscript"].includes(tag)) return "";
    if (["br","hr"].includes(tag)) return "\\\\n";
    if (n.hidden||(n.style&&(n.style.display==="none"||n.style.visibility==="hidden"))) return "";
    let r="";
    for (const c of n.childNodes) r+=w(c,d+1);
    if (["h1","h2","h3","h4","h5","h6"].includes(tag)) return "\\\\n"+"#".repeat(parseInt(tag[1]))+" "+r.trim()+"\\\\n\\\\n";
    if (tag==="p") return r.trim()+"\\\\n\\\\n";
    if (tag==="li") return "- "+r.trim()+"\\\\n";
    if (["ul","ol"].includes(tag)) return "\\\\n"+r+"\\\\n";
    if (tag==="a") { const h=n.href||""; return h?"["+r.trim()+"]("+h+") ":r; }
    if (tag==="img") { const a=n.alt||"",s=n.src||""; return s?"!["+a+"]("+s+") ":""; }
    if (tag==="blockquote") return "> "+r.trim()+"\\\\n\\\\n";
    if (tag==="code") return "\`"+r.trim()+"\`";
    if (tag==="pre") return "\`\`\`\\\\n"+r.trim()+"\\\\n\`\`\`\\\\n\\\\n";
    return r;
  }
  return w(document.body).replace(/\\\\n{3,}/g,"\\\\n\\\\n").trim();
}''')

async def extract(url, cdp_port, timeout):
    ws = get_ws_endpoint(cdp_port)
    if not ws:
        print(json.dumps({"status":"error","error":f"Cannot connect to Chrome CDP on port {cdp_port}"}), file=sys.stderr)
        sys.exit(1)
    async with async_playwright() as pw:
        br = await pw.chromium.connect_over_cdp(ws)
        ctx = br.contexts[0] if br.contexts else await br.new_context(viewport={"width":1280,"height":720},device_scale_factor=2)
        pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
        pg.set_default_timeout(timeout*1000)
        await pg.goto(url, wait_until="networkidle", timeout=timeout*1000)
        await pg.wait_for_load_state("domcontentloaded")
        await pg.evaluate("document.fonts.ready")
        await pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); await asyncio.sleep(1)
        await pg.evaluate("window.scrollTo(0,0)"); await asyncio.sleep(0.5)
        md = await extract_markdown(pg)
        samples = await pg.evaluate(build_sampler_js())
        sb64 = base64.b64encode(await pg.screenshot(full_page=False, type="png")).decode()
        fb64 = base64.b64encode(await pg.screenshot(full_page=True, type="png")).decode()
        vh = samples["viewport"]["height"]; sh = samples["viewport"]["scrollHeight"]
        segs = []
        for i in range(min(5, max(1, sh // vh))):
            y = i * (sh // max(1, sh // vh))
            await pg.evaluate(f"window.scrollTo(0,{y})"); await asyncio.sleep(0.3)
            segs.append(base64.b64encode(await pg.screenshot(full_page=False, type="png")).decode())
        return {"status":"ok","markdown":md,"colors":samples["colors"],"typography":samples["typography"],"spacing":samples["spacing"],"css_custom_properties":samples["css_custom_properties"],"animations":samples["animations"],"transitions":samples["transitions"],"layout_classes":samples["layout_classes"],"viewport":samples["viewport"],"screenshot_base64":sb64,"screenshot_full_base64":fb64,"screenshots":segs}

if __name__=="__main__":
    p=argparse.ArgumentParser(); p.add_argument("--url",required=True); p.add_argument("--cdp-port",type=int,default=9222); p.add_argument("--timeout",type=int,default=120); a=p.parse_args()
    try: print(json.dumps(asyncio.run(extract(a.url,a.cdp_port,a.timeout)),ensure_ascii=False))
    except Exception as e: print(json.dumps({"status":"error","error":str(e),"traceback":traceback.format_exc()}),file=sys.stderr); sys.exit(1)
PYEOF`;

  const result = await runInSandbox(sandboxId, accessToken, script, { timeoutMs: 15_000 });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to write Python agent: ${result.stderr || result.stdout?.slice(0, 200)}`);
  }
}

async function execPythonAgentInSandbox(
  url: string,
  sandboxId: string,
  accessToken: string | null,
): Promise<PythonAgentResult> {
  const result = await runInSandbox(
    sandboxId,
    accessToken,
    `cd /opt/forge && python3.11 agent.py --url "${url.replace(/"/g, '\\"')}" --cdp-port 9222 --timeout 120`,
    { timeoutMs: 180_000 },
  );

  const raw = result.stdout || result.stderr || "{}";
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/s);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  if (parsed.status === "error") {
    throw new Error(`Python agent error: ${(parsed.error as string) ?? "unknown"}`);
  }

  return {
    markdown: (parsed.markdown as string) ?? "",
    colors: (parsed.colors as Record<string, unknown>) ?? {},
    typography: (parsed.typography as Record<string, unknown>) ?? {},
    spacing: (parsed.spacing as Record<string, unknown>) ?? {},
    css_custom_properties: (parsed.css_custom_properties as Record<string, string>) ?? {},
    animations: (parsed.animations as unknown[]) ?? [],
    transitions: (parsed.transitions as unknown[]) ?? [],
    layout_classes: (parsed.layout_classes as unknown[]) ?? [],
    viewport: (parsed.viewport as PythonAgentResult["viewport"]) ?? { width: 1280, height: 720, devicePixelRatio: 2, scrollHeight: 720 },
    screenshot_base64: (parsed.screenshot_base64 as string) ?? "",
    screenshot_full_base64: (parsed.screenshot_full_base64 as string) ?? "",
    screenshots: (parsed.screenshots as string[]) ?? [],
  };
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

export async function extractDesignDnaForUrl(
  supabase: SupabaseClient,
  input: DesignDnaExtractionInput,
): Promise<DesignDnaExtractionResult> {
  const complexity: "low" | "high" = input.depth === "deep" ? "high" : "low";
  const [webSecrets, resolvedLlm, prefs] = await Promise.all([
    loadWebSecrets(supabase, input.userId),
    resolveLLMConfig(supabase, input.userId, complexity),
    loadAgentPreferences(supabase, input.userId),
  ]);
  const llmConfig: LLMConfig | null = resolvedLlm
    ? {
        apiKey: resolvedLlm.apiKey,
        baseUrl: resolvedLlm.baseUrl,
        model: resolvedLlm.model,
        label: resolvedLlm.label,
        protocol: resolvedLlm.protocol,
      }
    : null;

  const providerTrace: string[] = [];
  const notes: string[] = [];

  if (!resolvedLlm) {
    notes.push("⚠️ no LLM configured — configure LLM in /api-models for extraction");
  } else {
    providerTrace.push(`llm:${resolvedLlm.label} (${resolvedLlm.resolvedFrom})`);
  }

  // ── REFERO: Unified scrape via strategy router ──
  const hasSandbox = !!input.sandboxId;
  const hasLlm = !!resolvedLlm;

  let scrapeResult: ReferoScrapeResult;
  try {
    scrapeResult = await referoScrape(
      supabase,
      {
        url: input.url,
        depth: input.depth,
        categories: input.categories,
        userId: input.userId,
        sandboxId: input.sandboxId,
        sandboxAccessToken: input.sandboxAccessToken,
      },
      webSecrets,
      {
        primary: prefs?.webScrapeProvider ?? "jina",
        fallback: prefs?.webScrapeFallback,
      },
      hasLlm,
      hasSandbox,
    );

    // Add refero trace to provider trace
    for (const t of scrapeResult.trace) {
      providerTrace.push(`refero:${t}`);
    }
    providerTrace.push(`refero: strategy=${scrapeResult.strategy}, provider=${scrapeResult.provider}, duration=${scrapeResult.durationMs}ms`);

    notes.push(`REFERO: ${scrapeResult.strategy} via ${scrapeResult.provider} in ${Math.round(scrapeResult.durationMs / 1000)}s`);
  } catch (scrapeErr) {
    // REFERO failed — fall back to legacy scrapeWebPage
    notes.push(`⚠️ REFERO router failed: ${errorMessage(scrapeErr)} — falling back to legacy scrape`);
    providerTrace.push("refero:error");

    const scrapeProvider = prefs?.webScrapeProvider ?? "jina";
    const scrapeFallback = prefs?.webScrapeFallback;

    let markdownContent = "";
    let htmlContent = "";
    try {
      const mdRes = await scrapeWebPage(
        { url: input.url, format: "markdown", mode: "read", provider: scrapeProvider, only_main_content: true },
        webSecrets,
        { primary: scrapeProvider, fallback: scrapeFallback },
      );
      markdownContent = String(mdRes.content ?? "");
      providerTrace.push(`fallback:markdown via ${String(mdRes.provider ?? "unknown")}`);
    } catch { providerTrace.push("fallback:markdown:error"); }

    try {
      const htmlRes = await scrapeWebPage(
        { url: input.url, format: "html", mode: "read", provider: scrapeProvider, only_main_content: false },
        webSecrets,
        { primary: scrapeProvider, fallback: scrapeFallback },
      );
      htmlContent = String(htmlRes.content ?? "");
      providerTrace.push(`fallback:html via ${String(htmlRes.provider ?? "unknown")}`);
    } catch { providerTrace.push("fallback:html:error"); }

    scrapeResult = {
      provider: scrapeProvider,
      strategy: "multi-provider",
      markdown: markdownContent,
      html: htmlContent,
      title: "",
      screenshots: [],
      screenshotBase64: "",
      screenshotFullBase64: "",
      viewports: [],
      cssData: { byTag: {}, gridSystems: [], flexPatterns: [], designTokens: {}, colorPalette: [] },
      sections: [],
      components: [],
      fontFaces: [],
      animations: [],
      customProperties: {},
      viewport: { width: 1280, height: 800, devicePixelRatio: 2, scrollHeight: 800 },
      durationMs: 0,
      trace: ["fallback:legacy-scrape"],
    };
  }

  // ── HTML hygiene ──
  const rawMarkdown = scrapeResult.markdown.trim();
  const rawHtml = scrapeResult.html.trim();
  const cleaned = cleanHtmlDocument(rawHtml);
  const cleanHtml = cleaned.cleanHtml;
  const cleanText = cleaned.cleanText;
  const cleanMarkdown = htmlToMarkdownDocument(rawHtml);
  const cleanedMarkdown = finalizeDocumentMarkdown(cleanMarkdown || cleanText, {
    maxChars: 24_000,
  }).markdown;
  const contentHygiene = {
    title: cleaned.title || scrapeResult.title,
    rootSelector: cleaned.rootSelector,
    rawMarkdownChars: rawMarkdown.length,
    cleanMarkdownChars: cleanedMarkdown.length,
    rawHtmlChars: rawHtml.length,
    cleanHtmlChars: cleanHtml.length,
  };

  // ── Build enriched markdown from refero data ──
  let enrichedMarkdown = rawMarkdown || cleanedMarkdown;
  const screenshots = scrapeResult.screenshots ?? [];
  const screenshotBase64 = scrapeResult.screenshotBase64 ?? "";
  let screenshotUrl = screenshotBase64
    ? `data:image/png;base64,${screenshotBase64}`
    : scrapeResult.screenshotFullBase64
      ? `data:image/png;base64,${scrapeResult.screenshotFullBase64}`
      : `https://image.thum.io/get/width/1280/crop/720/fullpage/${encodeURIComponent(input.url)}`;

  // Append enhanced refero data to markdown
  const referoExtras: string[] = [];
  if (scrapeResult.cssData.gridSystems.length > 0) {
    referoExtras.push(`\n\n## Grid Systems (${scrapeResult.cssData.gridSystems.length} found)\n${JSON.stringify(scrapeResult.cssData.gridSystems)}`);
  }
  if (scrapeResult.cssData.flexPatterns.length > 0) {
    referoExtras.push(`\n\n## Flex Patterns (${scrapeResult.cssData.flexPatterns.length} found)\n${JSON.stringify(scrapeResult.cssData.flexPatterns.slice(0, 20))}`);
  }
  if (scrapeResult.cssData.designTokens && Object.keys(scrapeResult.cssData.designTokens).length > 0) {
    referoExtras.push(`\n\n## Design Tokens (${Object.keys(scrapeResult.cssData.designTokens).length} found)\n${JSON.stringify(scrapeResult.cssData.designTokens)}`);
  }
  if (scrapeResult.fontFaces.length > 0) {
    referoExtras.push(`\n\n## Font Faces (${scrapeResult.fontFaces.length} loaded)\n${JSON.stringify(scrapeResult.fontFaces)}`);
  }
  if (scrapeResult.sections.length > 0) {
    referoExtras.push(`\n\n## Page Sections (${scrapeResult.sections.length} detected)\n${JSON.stringify(scrapeResult.sections.map(s => ({ type: s.type, selector: s.selector, y: s.yPosition, height: s.height, text: s.textSummary.slice(0, 100) })))}`);
  }
  if (scrapeResult.components.length > 0) {
    referoExtras.push(`\n\n## DOM Components (${scrapeResult.components.length} detected)\n${JSON.stringify(scrapeResult.components.map(c => ({ type: c.componentType, selector: c.selector, anatomy: c.anatomy, count: c.patternCount })))}`);
  }
  if (scrapeResult.viewports.length > 0) {
    referoExtras.push(`\n\n## Responsive Viewports (${scrapeResult.viewports.length} captured)\n${JSON.stringify(scrapeResult.viewports.map(v => ({ label: v.label, width: v.width, height: v.height })))}`);
  }
  if (scrapeResult.customProperties && Object.keys(scrapeResult.customProperties).length > 0) {
    referoExtras.push(`\n\n## Deep Custom Properties (${Object.keys(scrapeResult.customProperties).length})\n${JSON.stringify(scrapeResult.customProperties)}`);
  }
  if (referoExtras.length > 0) {
    enrichedMarkdown += referoExtras.join("");
  }

  if (!enrichedMarkdown.trim()) {
    notes.push("markdown empty after scrape");
  }

  // ── Confidence score (weighted average of 6 real metrics) ──
  const hasMultiViewport = scrapeResult.viewports.length > 0;
  const hasCssData = scrapeResult.cssData.gridSystems.length > 0 || scrapeResult.cssData.flexPatterns.length > 0;
  const hasComponents = scrapeResult.components.length > 0;
  const hasSections = scrapeResult.sections.length > 0;
  const hasScreenshot = !!screenshotBase64;
  const contentDensity = Math.min(1, (enrichedMarkdown.length + cleanHtml.length) / 40000);

  // 6 metrics, each scored 0-100:
  const metrics = {
    // M1: Content depth — how much raw material the LLM has to work with
    contentDepth: Math.round(contentDensity * 100),
    // M2: Visual evidence — screenshot available (binary but weighted high)
    visualEvidence: hasScreenshot ? 80 : 10,
    // M3: Structural data — CSS grid/flex/design tokens extracted
    structuralData: hasCssData ? 90 : 15,
    // M4: Component coverage — DOM components detected
    componentCoverage: hasComponents ? Math.min(100, scrapeResult.components.length * 15) : 10,
    // M5: Section mapping — page sections detected
    sectionMapping: hasSections ? Math.min(100, scrapeResult.sections.length * 20) : 10,
    // M6: Extraction mode — deep mode inherently has more signal
    modeQuality: input.depth === "deep" ? 85 : 45,
  };

  // Weighted average: content (25%) + visual (15%) + structural (20%) + component (15%) + section (10%) + mode (15%)
  const confidence = Math.min(99, Math.round(
    metrics.contentDepth * 0.25 +
    metrics.visualEvidence * 0.15 +
    metrics.structuralData * 0.20 +
    metrics.componentCoverage * 0.15 +
    metrics.sectionMapping * 0.10 +
    metrics.modeQuality * 0.15
  ));

  notes.push(`confidence: ${confidence}/99 (depth=${metrics.contentDepth}, visual=${metrics.visualEvidence}, struct=${metrics.structuralData}, comp=${metrics.componentCoverage}, sect=${metrics.sectionMapping}, mode=${metrics.modeQuality})`);

  // ── LLM Extraction: Multi-pass (5 specialized passes + synthesis) ──
  let dna: Record<string, unknown> | null = null;

  if (llmConfig) {
    // Build a callLlm dispatcher that delegates to the proven 120s-timeout
    // protocol-specific chat functions. This ensures multi-pass uses the
    // EXACT same transport as the single-pass fallback path.
    const callLlm: LLmChatFn = (systemPrompt, userContent, screenshot) => {
      if (llmConfig.protocol === "anthropic") return anthropicChat(llmConfig, systemPrompt, userContent, screenshot);
      if (llmConfig.protocol === "gemini") return geminiChat(llmConfig, systemPrompt, userContent, screenshot);
      return openAiChat(llmConfig, systemPrompt, userContent, screenshot);
    };

    const mpResult = await multiPassExtractDNA({
      llmConfig,
      callLlm,
      url: input.url,
      markdown: enrichedMarkdown.slice(0, 30000),
      screenshot: screenshotUrl,
      categories: input.categories,
      isDeep: input.depth === "deep" && screenshots.length > 0,
    });

    dna = mpResult.dna;

    // Add multi-pass trace info
    providerTrace.push(`llm: multi-pass mode=${mpResult.mode}, ${mpResult.succeededCount} ok, ${mpResult.failedCount} fail, ${Math.round(mpResult.totalDurationMs / 1000)}s`);

    if (mpResult.passes.length > 0) {
      for (const p of mpResult.passes) {
        const status = p.error ? `FAIL (${p.error.slice(0, 60)})` : `OK (${Object.keys(p.data).length} fields, ${p.durationMs}ms)`;
        providerTrace.push(`llm: pass[${p.category}] ${status}`);
      }
    }

    if (!dna) {
      // Build a detailed error with per-pass failure reasons for diagnosis
      const passErrors = mpResult.passes
        .filter((p) => p.error)
        .map((p) => `${p.category}: ${p.error}`)
        .join("; ");
      const detail = passErrors
        ? `Pass errors: ${passErrors}. Mode: ${mpResult.mode}, OK: ${mpResult.succeededCount}, FAIL: ${mpResult.failedCount}, ${Math.round(mpResult.totalDurationMs / 1000)}s. LLM: ${llmConfig.label} (${llmConfig.protocol})`
        : `All ${mpResult.passes.length} passes returned empty data. Mode: ${mpResult.mode}, LLM: ${llmConfig.label} (${llmConfig.protocol})`;
      throw new Error(`LLM extraction failed — no DNA generated. ${detail}`);
    }
  } else {
    throw new Error("LLM extraction failed — no LLM configured. Configure LLM in /api-models.");
  }

  // ── DNA Validation ──
  const validationResult = validateDNA({
    dna,
    screenshotAvailable: !!screenshotBase64,
    multiViewportAvailable: hasMultiViewport,
    cssDataAvailable: hasCssData,
    componentsFromDOM: scrapeResult.components.length,
    sectionsDetected: scrapeResult.sections.length,
    scrapeProviderCount: 1,
  });

  if (validationResult.issues.length > 0) {
    notes.push(`DNA validation: ${validationResult.issues.slice(0, 3).join("; ")}`);
  }
  if (validationResult.autoFixes.length > 0) {
    notes.push(`DNA auto-fixes: ${validationResult.autoFixes.join("; ")}`);
  }
  providerTrace.push(`refero: validation score=${validationResult.validation.score}/100`);

  // If DNA was auto-fixed, use the fixed version
  const finalDna = validationResult.fixed ? validationResult.dna : dna;

  if (validationResult.reject) {
    notes.push(`⚠️ DNA rejected by validator (score=${validationResult.validation.score}/100) — below threshold`);
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
    blockedReason: null,
  };
}
