/**
 * SHALLOW canônico (Gate G3) — spec §3.2
 *
 * scrapeViaUserProvider → collectShallowEvidence → multiPassExtractDNA → validateDNA
 * Um provedor, sem router Refero, sem cadeia de fallback.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import { cleanHtmlDocument, htmlToMarkdownDocument } from "@/lib/html-hygiene";
import { scrapeWebPage } from "../../../supabase/functions/_shared/web-research-providers.ts";
import { finalizeDocumentMarkdown } from "../../../supabase/functions/_shared/document-sanitize.ts";
import { validateDNA } from "./refero/dna-validator.ts";
import { multiPassExtractDNA, type LLmChatFn } from "./refero/llm-multi-pass.ts";
import {
  createLlmChatDispatcher,
  loadAgentPreferences,
  loadWebSecrets,
  resolveLLMConfig,
  type DesignDnaExtractionInput,
  type DesignDnaExtractionResult,
  type LLMConfig,
} from "./design-dna-extraction.ts";

export const SHALLOW_SCRAPE_PREFS = { singleProvider: true, fallback: "none" as const };

export type ShallowScrapeBundle = {
  provider: string;
  markdown: string;
  html: string;
  title: string;
  screenshotBase64: string;
  trace: string[];
  durationMs: number;
};

export type ShallowEvidence = {
  rawMarkdown: string;
  rawHtml: string;
  cleanHtml: string;
  cleanMarkdown: string;
  contentHygiene: DesignDnaExtractionResult["contentHygiene"];
  enrichedMarkdown: string;
  screenshotUrl: string;
  screenshotBase64: string;
  screenshots: string[];
  providerTrace: string[];
  confidence: number;
  notes: string[];
};

function extractScreenshotBase64(result: Record<string, unknown>): string {
  const direct = result.screenshot_base64 ?? result.screenshotBase64;
  if (typeof direct === "string" && direct.trim()) {
    return direct.startsWith("data:") ? direct.split(",")[1] ?? direct : direct;
  }
  return "";
}

/**
 * Scrape via único provedor configurado pelo usuário — fail closed, sem fallback.
 */
export async function scrapeViaUserProvider(
  url: string,
  provider: string,
  webSecrets: Record<string, string>,
): Promise<ShallowScrapeBundle> {
  const startMs = Date.now();
  const trace: string[] = [];

  const mdRes = await scrapeWebPage(
    {
      url,
      format: "markdown",
      mode: "read",
      provider,
      only_main_content: true,
    },
    webSecrets,
    { primary: provider, ...SHALLOW_SCRAPE_PREFS },
  );
  const markdown = String(mdRes.content ?? "").trim();
  trace.push(`scrape:markdown:${String(mdRes.provider ?? provider)}`);

  const htmlRes = await scrapeWebPage(
    {
      url,
      format: "html",
      mode: "read",
      provider,
      only_main_content: false,
    },
    webSecrets,
    { primary: provider, ...SHALLOW_SCRAPE_PREFS },
  );
  const html = String(htmlRes.content ?? "").trim();
  const title = String(htmlRes.title ?? mdRes.title ?? "").trim();
  trace.push(`scrape:html:${String(htmlRes.provider ?? provider)}`);

  let screenshotBase64 = "";
  try {
    const shotRes = await scrapeWebPage(
      { url, format: "markdown", mode: "screenshot", provider },
      webSecrets,
      { primary: provider, ...SHALLOW_SCRAPE_PREFS },
    );
    screenshotBase64 = extractScreenshotBase64(shotRes);
    if (screenshotBase64) trace.push(`scrape:screenshot:${provider}`);
  } catch {
    trace.push("scrape:screenshot:unavailable");
  }

  if (!markdown && !html) {
    throw new Error(
      `Scrape via "${provider}" não retornou conteúdo para ${url}. ` +
        "Configure o provedor em API Models (/api-models) → Tools → Web Scrape.",
    );
  }

  return {
    provider,
    markdown,
    html,
    title,
    screenshotBase64,
    trace,
    durationMs: Date.now() - startMs,
  };
}

/** Normaliza conteúdo do scrape em evidência para multiPassExtractDNA. */
export function collectShallowEvidence(
  input: DesignDnaExtractionInput,
  scrape: ShallowScrapeBundle,
  llmLabel?: string,
): ShallowEvidence {
  const providerTrace: string[] = [];
  const notes: string[] = [];

  for (const t of scrape.trace) providerTrace.push(t);
  providerTrace.push(`shallow: provider=${scrape.provider}, duration=${scrape.durationMs}ms`);
  if (llmLabel) providerTrace.push(`llm:${llmLabel}`);

  const rawMarkdown = scrape.markdown;
  const rawHtml = scrape.html;
  const cleaned = cleanHtmlDocument(rawHtml);
  const cleanHtml = cleaned.cleanHtml;
  const cleanText = cleaned.cleanText;
  const cleanMarkdown = htmlToMarkdownDocument(rawHtml);
  const cleanedMarkdown = finalizeDocumentMarkdown(cleanMarkdown || cleanText, {
    maxChars: 24_000,
  }).markdown;

  const contentHygiene = {
    title: cleaned.title || scrape.title,
    rootSelector: cleaned.rootSelector,
    rawMarkdownChars: rawMarkdown.length,
    cleanMarkdownChars: cleanedMarkdown.length,
    rawHtmlChars: rawHtml.length,
    cleanHtmlChars: cleanHtml.length,
  };

  const enrichedMarkdown = rawMarkdown || cleanedMarkdown;
  if (!enrichedMarkdown.trim()) {
    notes.push("markdown vazio após scrape");
  }

  const screenshotBase64 = scrape.screenshotBase64;
  const screenshotUrl = screenshotBase64
    ? `data:image/png;base64,${screenshotBase64}`
    : "";
  const screenshots = screenshotBase64 ? [screenshotUrl] : [];

  const contentDensity = Math.min(1, (enrichedMarkdown.length + cleanHtml.length) / 40_000);
  const confidence = Math.min(
    99,
    Math.round(contentDensity * 100 * 0.6 + (screenshotBase64 ? 80 : 20) * 0.25 + 45 * 0.15),
  );
  notes.push(`confidence shallow: ${confidence}/99`);

  return {
    rawMarkdown,
    rawHtml,
    cleanHtml,
    cleanMarkdown: cleanedMarkdown,
    contentHygiene,
    enrichedMarkdown,
    screenshotUrl,
    screenshotBase64,
    screenshots,
    providerTrace,
    confidence,
    notes,
  };
}

/**
 * Pipeline SHALLOW canônico completo (G3).
 * Retorna DesignDnaExtractionResult para persistLibraryEntry em run-design-dna.
 */
export async function runShallowExtraction(
  supabase: SupabaseClient,
  input: DesignDnaExtractionInput,
): Promise<DesignDnaExtractionResult> {
  const [webSecrets, resolvedLlm, prefs] = await Promise.all([
    loadWebSecrets(supabase, input.userId),
    resolveLLMConfig(supabase, input.userId, "low"),
    loadAgentPreferences(supabase, input.userId),
  ]);

  const scrapeProvider = prefs?.webScrapeProvider?.trim();
  if (!scrapeProvider) {
    throw new Error(
      "Nenhum provedor de scrape configurado. Configure em API Models (/api-models) → Tools → Web Scrape.",
    );
  }

  if (!resolvedLlm) {
    throw new Error(
      "Nenhum modelo LLM configurado. Configure em API Models (/api-models) → Modelos.",
    );
  }

  const llmConfig: LLMConfig = {
    apiKey: resolvedLlm.apiKey,
    baseUrl: resolvedLlm.baseUrl,
    model: resolvedLlm.model,
    label: resolvedLlm.label,
    protocol: resolvedLlm.protocol,
  };

  let scrape: ShallowScrapeBundle;
  try {
    scrape = await scrapeViaUserProvider(input.url, scrapeProvider, webSecrets);
  } catch (err) {
    throw new Error(`Scrape falhou (${scrapeProvider}): ${errorMessage(err)}`);
  }

  const evidence = collectShallowEvidence(input, scrape, resolvedLlm.label);
  const callLlm: LLmChatFn = createLlmChatDispatcher(llmConfig);

  const mpResult = await multiPassExtractDNA({
    llmConfig,
    callLlm,
    url: input.url,
    markdown: evidence.enrichedMarkdown.slice(0, 30_000),
    screenshot: evidence.screenshotUrl,
    categories: input.categories,
    isDeep: false,
  });

  evidence.providerTrace.push(
    `llm: multi-pass mode=${mpResult.mode}, ${mpResult.succeededCount} ok, ${mpResult.failedCount} fail, ${Math.round(mpResult.totalDurationMs / 1000)}s`,
  );

  if (mpResult.passes.length > 0) {
    for (const p of mpResult.passes) {
      const status = p.error
        ? `FAIL (${p.error.slice(0, 60)})`
        : `OK (${Object.keys(p.data).length} fields, ${p.durationMs}ms)`;
      evidence.providerTrace.push(`llm: pass[${p.category}] ${status}`);
    }
  }

  const dna = mpResult.dna;
  if (!dna) {
    const passErrors = mpResult.passes
      .filter((p) => p.error)
      .map((p) => `${p.category}: ${p.error}`)
      .join("; ");
    const detail = passErrors
      ? `Pass errors: ${passErrors}. Mode: ${mpResult.mode}, OK: ${mpResult.succeededCount}, FAIL: ${mpResult.failedCount}`
      : `All ${mpResult.passes.length} passes returned empty data.`;
    throw new Error(`LLM extraction failed — no DNA generated. ${detail}`);
  }

  const validationResult = validateDNA({
    dna,
    screenshotAvailable: !!evidence.screenshotBase64,
    multiViewportAvailable: false,
    cssDataAvailable: false,
    componentsFromDOM: 0,
    sectionsDetected: 0,
    scrapeProviderCount: 1,
  });

  if (validationResult.issues.length > 0) {
    evidence.notes.push(`DNA validation: ${validationResult.issues.slice(0, 3).join("; ")}`);
  }
  if (validationResult.autoFixes.length > 0) {
    evidence.notes.push(`DNA auto-fixes: ${validationResult.autoFixes.join("; ")}`);
  }
  evidence.providerTrace.push(`validate: score=${validationResult.validation.score}/100`);

  const finalDna = validationResult.fixed ? validationResult.dna : dna;
  const validationRejected = validationResult.reject;
  if (validationRejected) {
    evidence.notes.push(
      `⚠️ DNA rejected by validator (score=${validationResult.validation.score}/100) — below threshold`,
    );
  }

  return {
    dna: finalDna,
    rawMarkdown: evidence.rawMarkdown,
    cleanMarkdown: evidence.cleanMarkdown,
    rawHtml: evidence.rawHtml,
    cleanHtml: evidence.cleanHtml,
    contentHygiene: evidence.contentHygiene,
    screenshotUrl: evidence.screenshotUrl,
    screenshotBase64: evidence.screenshotBase64 || undefined,
    screenshots: evidence.screenshots,
    providerTrace: evidence.providerTrace,
    confidence: evidence.confidence,
    notes: evidence.notes,
    blockedReason: null,
    validationRejected,
    validationScore: validationResult.validation.score,
  };
}