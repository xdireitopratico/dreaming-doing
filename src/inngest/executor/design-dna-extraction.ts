import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanHtmlDocument, htmlToMarkdownDocument } from "@/lib/html-hygiene";
import { scrapeWebPage } from "../../../supabase/functions/_shared/web-research-providers.ts";
import { finalizeDocumentMarkdown } from "../../../supabase/functions/_shared/document-sanitize.ts";
import { buildPlaywrightScript } from "../../../supabase/functions/extract-design-dna/playwright-automation.ts";
import { CATEGORY_PROMPTS, MASTER_EXTRACTION_PROMPT, type ExtractionCategory } from "../../../supabase/functions/extract-design-dna/prompts.ts";

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

async function loadWebSecrets(
  supabase: SupabaseClient,
  userId: string,
): Promise<WebSecrets> {
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
    .eq("kind", "web_search")
    .order("updated_at", { ascending: false })
    .limit(5);

  const providerKeyMap: Record<string, string> = {
    brave: "BRAVE_SEARCH_API_KEY",
    tavily: "TAVILY_API_KEY",
    serper: "SERPER_API_KEY",
    firecrawl: "FIRECRAWL_API_KEY",
    browserless: "BROWSERLESS_API_KEY",
  };

  for (const row of data ?? []) {
    const provider = String((row as { provider?: string | null }).provider ?? "").trim();
    const token = parseTokenField((row as { token_encrypted?: string | null }).token_encrypted)[0];
    const keyName = providerKeyMap[provider];
    if (keyName && token) secrets[keyName] = token;
  }

  return secrets;
}

async function resolveLLMConfig(supabase: SupabaseClient, userId: string): Promise<LLMConfig | null> {
  const { data } = await supabase
    .from("connectors")
    .select("kind, provider, token_encrypted, meta")
    .eq("owner_id", userId)
    .not("token_encrypted", "is", null)
    .order("updated_at", { ascending: false })
    .limit(20);

  const rows = data ?? [];
  const pick = (apiKey: string, baseUrl: string, model: string, label: string): LLMConfig => ({
    apiKey,
    baseUrl,
    model,
    label,
  });

  for (const row of rows) {
    const kind = String((row as { kind?: string | null }).kind ?? "").trim();
    const provider = String((row as { provider?: string | null }).provider ?? kind).trim();
    const token = parseTokenField((row as { token_encrypted?: string | null }).token_encrypted)[0];
    const meta = ((row as { meta?: Record<string, unknown> | null }).meta ?? {}) as Record<string, unknown>;
    if (!token) continue;

    if (provider === "openrouter") return pick(token, "https://openrouter.ai/api/v1", "openai/gpt-4o-mini", "OpenRouter");
    if (provider === "groq") return pick(token, "https://api.groq.com/openai/v1", "llama-3.1-8b-instant", "Groq");
    if (provider === "deepseek") return pick(token, "https://api.deepseek.com/v1", "deepseek-chat", "DeepSeek");
    if (provider === "xai") return pick(token, "https://api.x.ai/v1", "grok-2-latest", "xAI");
    if (provider === "gemini") {
      return pick(token, "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-1.5-flash", "Gemini");
    }
    if (provider === "openai" || kind === "openai") {
      return pick(token, "https://api.openai.com/v1", "gpt-4o-mini", "OpenAI");
    }
    if (provider === "ollama" || kind === "ollama") {
      const baseUrl = String(meta.baseUrl ?? meta.base_url ?? process.env.OLLAMA_BASE_URL ?? "").trim();
      const model = String(meta.defaultModel ?? meta.model ?? process.env.OLLAMA_MODEL ?? "llama3.1").trim();
      if (baseUrl) return pick("ollama", baseUrl.replace(/\/$/, ""), model, "Ollama");
    }
  }

  const envKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY;
  if (process.env.OPENROUTER_API_KEY) return pick(process.env.OPENROUTER_API_KEY, "https://openrouter.ai/api/v1", "openai/gpt-4o-mini", "OpenRouter");
  if (process.env.GROQ_API_KEY) return pick(process.env.GROQ_API_KEY, "https://api.groq.com/openai/v1", "llama-3.1-8b-instant", "Groq");
  if (process.env.DEEPSEEK_API_KEY) return pick(process.env.DEEPSEEK_API_KEY, "https://api.deepseek.com/v1", "deepseek-chat", "DeepSeek");
  if (process.env.XAI_API_KEY) return pick(process.env.XAI_API_KEY, "https://api.x.ai/v1", "grok-2-latest", "xAI");
  if (process.env.GEMINI_API_KEY) {
    return pick(
      process.env.GEMINI_API_KEY,
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "gemini-1.5-flash",
      "Gemini",
    );
  }
  if (process.env.OPENAI_API_KEY) return pick(process.env.OPENAI_API_KEY, "https://api.openai.com/v1", "gpt-4o-mini", "OpenAI");
  if (process.env.OLLAMA_BASE_URL) {
    return pick(
      "ollama",
      process.env.OLLAMA_BASE_URL.replace(/\/$/, ""),
      process.env.OLLAMA_MODEL ?? "llama3.1",
      "Ollama",
    );
  }
  return envKey ? pick(envKey, "https://api.openai.com/v1", "gpt-4o-mini", "OpenAI") : null;
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
  const webSecrets = await loadWebSecrets(supabase, input.userId);
  const llmConfig = await resolveLLMConfig(supabase, input.userId);

  const providerTrace: string[] = [];
  const notes: string[] = [];

  const markdownRes = await scrapeWebPage(
    {
      url: input.url,
      format: "markdown",
      mode: "read",
      provider: "auto",
      only_main_content: true,
    },
    webSecrets,
  );
  providerTrace.push(`markdown:${String(markdownRes.provider ?? "unknown")}`);

  const htmlRes = await scrapeWebPage(
    {
      url: input.url,
      format: "html",
      mode: "read",
      provider: "auto",
      only_main_content: false,
    },
    webSecrets,
  );
  providerTrace.push(`html:${String(htmlRes.provider ?? "unknown")}`);

  const rawMarkdown = String(markdownRes.content ?? "").trim();
  const rawHtml = String(htmlRes.content ?? "").trim();
  const cleaned = cleanHtmlDocument(rawHtml);
  const cleanHtml = cleaned.cleanHtml;
  const cleanText = cleaned.cleanText;
  const cleanMarkdown = htmlToMarkdownDocument(rawHtml);
  const cleanedMarkdown = finalizeDocumentMarkdown(cleanMarkdown || cleanText, { maxChars: 24_000 }).markdown;
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
      const playwrightData = await execPlaywrightInSandbox(input.url, input.sandboxExecUrl, input.sandboxToken);
      providerTrace.push("sandbox:playwright");
      enrichedMarkdown = [
        playwrightData.markdown,
        cleanedMarkdown,
        `\n\n## CSS Computado (sections principais)\n${playwrightData.css_computed}`,
        `\n\n## Motion Traces\n${playwrightData.motion_traces}`,
        playwrightData.color_scheme ? `\n\n## Color Scheme\n${playwrightData.color_scheme}` : "",
        playwrightData.page_height ? `\n\n## Page Metrics\n- Full page height: ${playwrightData.page_height}px` : "",
      ].join("");

      screenshots = playwrightData.screenshots ?? [];
      screenshotBase64 = screenshots[0] ?? playwrightData.screenshot_base64 ?? "";
      screenshotUrl = screenshotBase64 ? `data:image/png;base64,${screenshotBase64}` : screenshotUrl;
      notes.push("deep sandbox extraction completed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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

  const density = Math.min(1, (enrichedMarkdown.length + cleanHtml.length + cleanText.length + cleanedMarkdown.length) / 50000);
  let confidence = input.depth === "deep"
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

  const finalDna = dna ?? buildFallbackDna(input.url, llmConfig ? "LLM extraction unavailable" : "no LLM key available");

  if (!llmConfig) {
    notes.push("no LLM config available; using heuristic fallback");
  }

  if ((finalDna.quality_score as number | undefined) !== undefined && (finalDna.quality_score as number) <= 3) {
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
