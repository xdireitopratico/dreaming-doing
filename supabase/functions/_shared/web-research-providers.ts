/**
 * Provider-agnostic web scrape + search for agent runtime tools.
 * Tenant secrets (editor) drive provider choice; free fallbacks when unset.
 */

declare const Deno: {
  env: { get(name: string): string | undefined };
  makeTempFile(options?: { prefix?: string; suffix?: string }): Promise<string>;
  writeTextFile(path: string, data: string): Promise<void>;
  remove(path: string): Promise<void>;
};

import {
  cleanHtmlDocument,
  htmlToMarkdownDocument,
  htmlToVisibleText,
} from "../../../src/lib/html-hygiene.ts";
import {
  finalizeDocumentMarkdown,
  sanitizeDocumentMarkdown,
  structurePlainTextAsMarkdown,
} from "./document-sanitize.ts";

export type WebSecrets = Record<string, string>;
export type WebParserProvider = "builtin" | "cheerio" | "llamaindex" | "markitdown";

function pickSecret(secrets: WebSecrets, names: string[]): string | undefined {
  for (const name of names) {
    const v = secrets[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 350,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        /timeout|429|5\d\d|network|fetch failed|ECONNRESET|ETIMEDOUT|rate limit/i.test(message);
      if (!transient || attempt === attempts - 1) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[web_scrape] ${label} retry ${attempt + 1}/${attempts}: ${message}`);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

function normalizeParserProvider(parser?: string): WebParserProvider {
  switch (String(parser || "").trim()) {
    case "cheerio":
    case "llamaindex":
    case "markitdown":
      return parser as WebParserProvider;
    default:
      return "builtin";
  }
}

async function parseWithCheerio(rawHtml: string, fallbackText: string): Promise<string> {
  const hygiene = cleanHtmlDocument(rawHtml || "");
  const cheerioMarkdown = htmlToMarkdownDocument(hygiene.cleanHtml || rawHtml || "");
  const candidate = cheerioMarkdown || hygiene.cleanText || fallbackText;
  return finalizeDocumentMarkdown(candidate, { structure: true }).markdown;
}

async function parseWithLlamaIndex(rawHtml: string, fallbackText: string): Promise<string> {
  const sourceMarkdown = htmlToMarkdownDocument(rawHtml || "") || fallbackText;
  const cleanMarkdown = finalizeDocumentMarkdown(sourceMarkdown, { structure: false }).markdown;

  try {
    const { Document, MarkdownNodeParser } = await import("npm:llamaindex");
    const parser = new MarkdownNodeParser();
    const docs = [new Document({ text: cleanMarkdown })];
    const nodes = await parser.getNodesFromDocuments(docs);
    const content = nodes
      .map((node: { text?: string }) => String(node.text || "").trim())
      .filter(Boolean)
      .join("\n\n");

    return content || cleanMarkdown;
  } catch (error) {
    console.warn(
      `[web_parser] llamaindex failed, using Forge Default: ${(error as Error).message}`,
    );
    return finalizeDocumentMarkdown(cleanMarkdown, { structure: true }).markdown;
  }
}

async function parseWithMarkItDown(rawHtml: string, fallbackText: string): Promise<string> {
  const payload = rawHtml || fallbackText;
  if (!payload.trim()) return "";

  let tempPath = "";
  try {
    const { runMarkitdown } = await import("npm:@mote-software/markitdown");
    tempPath = await Deno.makeTempFile({
      prefix: "forge-web-parser-",
      suffix: rawHtml ? ".html" : ".md",
    });
    await Deno.writeTextFile(tempPath, payload);
    const markdown = await runMarkitdown(tempPath);
    const normalized = typeof markdown === "string" ? markdown : String(markdown ?? "");
    return finalizeDocumentMarkdown(normalized || fallbackText, { structure: true }).markdown;
  } catch (error) {
    console.warn(
      `[web_parser] markitdown failed, using Forge Default: ${(error as Error).message}`,
    );
    return finalizeDocumentMarkdown(payload, { structure: true }).markdown;
  } finally {
    if (tempPath) {
      try {
        await Deno.remove(tempPath);
      } catch {
        /* noop */
      }
    }
  }
}

async function normalizeContentByParser(
  rawHtml: string,
  format: string,
  parser: string | undefined,
): Promise<{
  title: string;
  content: string;
  cleanHtml: string;
  cleanText: string;
  parser: WebParserProvider;
}> {
  const parserName = normalizeParserProvider(parser);
  const hygiene = cleanHtmlDocument(rawHtml || "");
  const cleanHtml = hygiene.cleanHtml || rawHtml || "";
  const cleanText = hygiene.cleanText || "";
  const builtinMarkdown = htmlToMarkdownDocument(rawHtml || "");

  if (format === "html") {
    return {
      title: hygiene.title,
      content: cleanHtml,
      cleanHtml,
      cleanText,
      parser: parserName,
    };
  }

  const fallbackText = cleanText || htmlToVisibleText(rawHtml || "");
  let content = builtinMarkdown || fallbackText;

  switch (parserName) {
    case "cheerio":
      content = await parseWithCheerio(cleanHtml, fallbackText);
      break;
    case "llamaindex":
      content = await parseWithLlamaIndex(cleanHtml, fallbackText);
      break;
    case "markitdown":
      content = await parseWithMarkItDown(cleanHtml, fallbackText);
      break;
    default:
      content = finalizeDocumentMarkdown(builtinMarkdown || fallbackText, {
        structure: true,
      }).markdown;
      break;
  }

  return {
    title: hygiene.title,
    content,
    cleanHtml,
    cleanText,
    parser: parserName,
  };
}

async function normalizeTextByParser(text: string, parser: string | undefined): Promise<string> {
  const parserName = normalizeParserProvider(parser);
  const clean = String(text || "").trim();
  if (!clean) return "";

  switch (parserName) {
    case "cheerio":
      return structurePlainTextAsMarkdown(clean) || clean;
    case "llamaindex":
      return await parseWithLlamaIndex("", clean);
    case "markitdown":
      return await parseWithMarkItDown("", clean);
    default:
      return finalizeDocumentMarkdown(sanitizeDocumentMarkdown(clean), { structure: true })
        .markdown;
  }
}

function normalizeProviderBaseUrl(baseUrl: string | undefined, fallback: string): string {
  const raw = String(baseUrl || fallback || "").trim();
  return raw.replace(/\/$/, "");
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (
    contentType.includes("application/json") ||
    contentType.includes("application/problem+json")
  ) {
    return await response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildSearchQueries(query: string): string[] {
  const normalized = String(query || "").trim();
  if (!normalized) return [];
  const compact = normalized.replace(/\s+/g, " ");
  const tokens = compact.split(" ").filter(Boolean);
  const variants = [compact];
  if (tokens.length >= 3) variants.push(tokens.slice(0, Math.min(tokens.length, 5)).join(" "));
  if (tokens.length >= 5) variants.push(tokens.slice(-5).join(" "));
  return Array.from(new Set(variants)).filter(Boolean).slice(0, 3);
}

function extractTextFromJsonPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.markdown,
    record.content,
    record.text,
    record.raw_markdown,
    record.fit_markdown,
    record.html,
    record.excerpts,
    record.results,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (Array.isArray(candidate)) {
      const joined = candidate
        .map((item) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return "";
          const itemRecord = item as Record<string, unknown>;
          return [
            itemRecord.content,
            itemRecord.markdown,
            itemRecord.text,
            itemRecord.excerpt,
            itemRecord.excerpts,
            itemRecord.full_content,
          ]
            .flatMap((entry) => {
              if (typeof entry === "string") return [entry];
              if (Array.isArray(entry))
                return entry.filter((x) => typeof x === "string") as string[];
              return [];
            })
            .join("\n");
        })
        .filter(Boolean)
        .join("\n");
      if (joined.trim()) return joined;
    }
  }

  return "";
}

async function scrapeViaJina(
  url: string,
  format: string,
  mode: string,
  apiKey?: string,
): Promise<Record<string, unknown>> {
  return withRetry(
    "jina",
    async () => {
      const jinaUrl =
        mode === "screenshot"
          ? `https://s.jina.ai/${encodeURIComponent(url)}`
          : `https://r.jina.ai/${encodeURIComponent(url)}`;

      const headers: Record<string, string> = { Accept: "application/json" };
      if (format === "html") headers["X-Return-Format"] = "html";
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const response = await fetch(jinaUrl, { headers, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Jina Reader failed: HTTP ${response.status}`);

      if (mode === "screenshot") {
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return { screenshot_base64: base64, url, provider: "jina" };
      }

      const data = await response.json();
      const content = data.data?.content || data.data?.text || "";
      return {
        title: data.data?.title || "",
        content,
        url: data.data?.url || url,
        word_count: content.split(/\s+/).filter(Boolean).length,
        provider: "jina",
      };
    },
    2,
  );
}

async function scrapeViaBrowserless(
  url: string,
  apiKey: string,
  input: Record<string, unknown>,
  format: string,
): Promise<Record<string, unknown>> {
  return withRetry(
    "browserless",
    async () => {
      const browserlessUrl = new URL("https://chrome.browserless.io/content");
      browserlessUrl.searchParams.set("token", apiKey);

      const response = await fetch(browserlessUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          waitFor: input.wait_for || 0,
          bestAttempt: true,
          blockAds: true,
          gotoOptions: {
            waitUntil: "networkidle2",
            timeout: 30000,
          },
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "unknown");
        throw new Error(
          `Browserless content failed: HTTP ${response.status} — ${errText.substring(0, 200)}`,
        );
      }

      const html = await response.text();
      const content =
        format === "html" ? html : htmlToMarkdownDocument(html) || htmlToVisibleText(html);
      return {
        title: "",
        content,
        url,
        word_count: content.split(/\s+/).filter(Boolean).length,
        provider: "browserless",
      };
    },
    2,
  );
}

async function scrapeViaFirecrawl(
  url: string,
  apiKey: string,
  input: Record<string, unknown>,
  format: string,
): Promise<Record<string, unknown>> {
  return withRetry(
    "firecrawl",
    async () => {
      const fcResponse = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: [format === "html" ? "html" : "markdown"],
          onlyMainContent: input.only_main_content !== false,
          waitFor: input.wait_for || 0,
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!fcResponse.ok) {
        const errText = await fcResponse.text().catch(() => "unknown");
        throw new Error(
          `Firecrawl scrape failed: HTTP ${fcResponse.status} — ${errText.substring(0, 200)}`,
        );
      }

      const fcData = await fcResponse.json();
      const content = fcData.data?.markdown || fcData.data?.html || "";
      return {
        title: fcData.data?.metadata?.title || "",
        content,
        url: fcData.data?.metadata?.sourceURL || url,
        word_count: content.split(/\s+/).filter(Boolean).length,
        metadata: fcData.data?.metadata || {},
        provider: "firecrawl",
      };
    },
    2,
  );
}

async function scrapeViaScrapeGraphAI(
  url: string,
  apiKey: string,
  input: Record<string, unknown>,
  format: string,
  baseUrl = "https://v2-api.scrapegraphai.com",
): Promise<Record<string, unknown>> {
  return withRetry(
    "scrapegraphai",
    async () => {
      const res = await fetch(
        `${normalizeProviderBaseUrl(baseUrl, "https://v2-api.scrapegraphai.com")}/api/scrape`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "SGAI-APIKEY": apiKey,
          },
          body: JSON.stringify({
            url,
            format: format === "html" ? "html" : "markdown",
            formats: [{ type: format === "html" ? "html" : "markdown" }],
            fetchConfig: {
              wait: input.wait_for || 0,
              mode: "js",
              stealth: true,
            },
          }),
          signal: AbortSignal.timeout(45000),
        },
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        throw new Error(
          `ScrapeGraphAI scrape failed: HTTP ${res.status} — ${errText.substring(0, 200)}`,
        );
      }

      const data = await readResponseBody(res);
      const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      const rawResults = Array.isArray(payload.results) ? payload.results : [];
      const first =
        rawResults.length > 0 && typeof rawResults[0] === "object"
          ? (rawResults[0] as Record<string, unknown>)
          : {};
      const parser = String(input.parser || input.parser_provider || "builtin");
      const rawContent = String(
        payload.content ||
          payload.markdown ||
          payload.html ||
          first.content ||
          first.markdown ||
          first.html ||
          extractTextFromJsonPayload(payload) ||
          "",
      );
      const normalized =
        format === "html"
          ? await normalizeContentByParser(rawContent, "html", parser)
          : {
              title: String(payload.title || first.title || ""),
              content: await normalizeTextByParser(rawContent, parser),
            };

      return {
        title: normalized.title || String(payload.title || first.title || ""),
        content: normalized.content || rawContent,
        url: String(payload.url || first.url || url),
        word_count: String(normalized.content || rawContent)
          .split(/\s+/)
          .filter(Boolean).length,
        metadata: payload.metadata || {},
        provider: "scrapegraphai",
      };
    },
    2,
  );
}

async function scrapeViaCrawl4AI(
  url: string,
  apiKey: string,
  input: Record<string, unknown>,
  format: string,
  baseUrl = "http://localhost:11235",
): Promise<Record<string, unknown>> {
  return withRetry(
    "crawl4ai",
    async () => {
      const root = normalizeProviderBaseUrl(baseUrl, "http://localhost:11235");
      const parser = String(input.parser || input.parser_provider || "builtin");
      const encodedUrl = encodeURIComponent(url);
      const getPath = format === "html" ? `/html/${encodedUrl}` : `/md/${encodedUrl}`;
      const headers: Record<string, string> = {};
      if (apiKey) headers["X-API-KEY"] = apiKey;

      let payload: unknown;
      const getRes = await fetch(`${root}${getPath}`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(45000),
      });

      if (getRes.ok) {
        payload = await readResponseBody(getRes);
      } else {
        const postRes = await fetch(`${root}/crawl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-KEY": apiKey } : {}),
          },
          body: JSON.stringify({
            url,
            urls: [url],
            format: format === "html" ? "html" : "markdown",
            markdown: format !== "html",
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!postRes.ok) {
          const errText = await postRes.text().catch(() => "unknown");
          throw new Error(
            `Crawl4AI scrape failed: HTTP ${postRes.status} — ${errText.substring(0, 200)}`,
          );
        }
        payload = await readResponseBody(postRes);
      }

      const record =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const rawContent = String(
        record.markdown ||
          record.content ||
          record.text ||
          record.raw_markdown ||
          record.fit_markdown ||
          record.html ||
          extractTextFromJsonPayload(record) ||
          (typeof payload === "string" ? payload : ""),
      );
      const normalized =
        format === "html"
          ? await normalizeContentByParser(rawContent, "html", parser)
          : {
              title: String(
                record.title ||
                  (record.metadata as Record<string, unknown> | undefined)?.title ||
                  "",
              ),
              content: await normalizeTextByParser(rawContent, parser),
            };

      return {
        title:
          normalized.title ||
          String(
            record.title || (record.metadata as Record<string, unknown> | undefined)?.title || "",
          ),
        content: normalized.content || rawContent,
        url: String(
          record.url || (record.metadata as Record<string, unknown> | undefined)?.url || url,
        ),
        word_count: String(normalized.content || rawContent)
          .split(/\s+/)
          .filter(Boolean).length,
        metadata: record.metadata || {},
        provider: "crawl4ai",
      };
    },
    2,
  );
}

async function scrapeViaHttp(url: string): Promise<Record<string, unknown>> {
  return withRetry(
    "http",
    async () => {
      const response = await fetch(url, {
        headers: { "User-Agent": "AetherForge/1.0 (web_scrape fallback)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP fetch failed: ${response.status}`);
      const html = await response.text();
      const text = (htmlToMarkdownDocument(html) || htmlToVisibleText(html)).slice(0, 50000);
      return {
        title: "",
        content: text,
        url,
        word_count: text.split(/\s+/).filter(Boolean).length,
        provider: "http",
      };
    },
    2,
  );
}

async function applyParserToScrapeResult(
  result: Record<string, unknown>,
  format: string,
  parser: string | undefined,
): Promise<Record<string, unknown>> {
  if (format === "html") return result;
  const content = await normalizeTextByParser(String(result.content || ""), parser);
  return { ...result, content };
}

export async function scrapeWebPage(
  input: Record<string, unknown>,
  secrets: WebSecrets,
  prefs: WebProviderPrefs = {},
): Promise<Record<string, unknown>> {
  const url = String(input.url || "");
  if (!url) throw new Error("url is required");

  const mode = String(input.mode || "read");
  const format = String(input.format || "markdown");
  const provider = String(input.provider || prefs.primary || "jina");
  const parser = String(input.parser || input.parser_provider || prefs.parser || "builtin");
  const fallback = String(prefs.fallback || (provider === "jina" ? "http" : "jina"));
  const firecrawlKey = pickSecret(secrets, ["FIRECRAWL_API_KEY"]);
  const browserlessKey = pickSecret(secrets, ["BROWSERLESS_API_KEY"]);
  const scrapeGraphKey = pickSecret(secrets, ["SCRAPEGRAPHAI_API_KEY"]);
  const scrapeGraphBaseUrl = pickSecret(secrets, ["SCRAPEGRAPHAI_BASE_URL"]);
  const crawl4aiKey = pickSecret(secrets, ["CRAWL4AI_API_KEY"]);
  const crawl4aiBaseUrl = pickSecret(secrets, ["CRAWL4AI_BASE_URL"]);
  const jinaKey = pickSecret(secrets, ["JINA_API_KEY"]);

  const run = async (name: string): Promise<Record<string, unknown>> => {
    switch (name) {
      case "firecrawl":
        if (!firecrawlKey) throw new Error("Firecrawl sem chave configurada");
        return await applyParserToScrapeResult(
          await scrapeViaFirecrawl(url, firecrawlKey, input, format),
          format,
          parser,
        );
      case "scrapegraphai":
        if (!scrapeGraphKey) throw new Error("ScrapeGraphAI sem chave configurada");
        return await applyParserToScrapeResult(
          await scrapeViaScrapeGraphAI(
            url,
            scrapeGraphKey,
            { ...input, parser },
            format,
            scrapeGraphBaseUrl || undefined,
          ),
          format,
          parser,
        );
      case "crawl4ai":
        if (!crawl4aiKey && !crawl4aiBaseUrl) {
          throw new Error("Crawl4AI sem chave ou base URL configurada");
        }
        return await applyParserToScrapeResult(
          await scrapeViaCrawl4AI(
            url,
            crawl4aiKey || "",
            { ...input, parser },
            format,
            crawl4aiBaseUrl || undefined,
          ),
          format,
          parser,
        );
      case "browserless":
        if (mode === "screenshot") throw new Error("Browserless não é fallback de screenshot");
        if (!browserlessKey) throw new Error("Browserless sem chave configurada");
        return await applyParserToScrapeResult(
          await scrapeViaBrowserless(url, browserlessKey, input, format),
          format,
          parser,
        );
      case "http":
        return await applyParserToScrapeResult(await scrapeViaHttp(url), format, parser);
      case "jina":
        return await applyParserToScrapeResult(
          await scrapeViaJina(url, format, mode, jinaKey),
          format,
          parser,
        );
      case "auto": {
        const autoCandidates = [
          "firecrawl",
          "scrapegraphai",
          "crawl4ai",
          "browserless",
          "jina",
          "http",
        ];
        let lastErr: Error | null = null;
        for (const candidate of autoCandidates) {
          try {
            return await run(candidate);
          } catch (err) {
            lastErr = err as Error;
            console.warn(`[web_scrape] auto ${candidate} falhou:`, lastErr.message);
          }
        }
        throw lastErr ?? new Error("Nenhum provider disponível para web_scrape");
      }
      case "none":
        throw new Error("Nenhum fallback configurado");
      default:
        throw new Error(`Provider de scrape desconhecido: ${name}`);
    }
  };

  const attempts = [provider, fallback];
  if (fallback !== "http" && mode !== "screenshot") attempts.push("http");
  const dedupedAttempts = attempts.filter(
    (name, index) => name && attempts.indexOf(name) === index,
  );

  let lastErr: Error | null = null;
  for (const attempt of dedupedAttempts) {
    try {
      return await run(attempt);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[web_scrape] ${attempt} falhou:`, lastErr.message);
    }
  }

  throw lastErr ?? new Error("web_scrape indisponível");
}

async function searchViaSerper(query: string, apiKey: string, limit: number) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: limit }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Serper failed: HTTP ${res.status}`);
  const data = await res.json();
  const results = (data.organic || [])
    .slice(0, limit)
    .map((r: { title?: string; link?: string; snippet?: string }) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));
  return { query, results, provider: "serper", count: results.length };
}

async function searchViaTavily(query: string, apiKey: string, limit: number) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: limit }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tavily failed: HTTP ${res.status}`);
  const data = await res.json();
  const results = (data.results || []).map(
    (r: { title?: string; url?: string; content?: string }) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    }),
  );
  return { query, results, provider: "tavily", count: results.length };
}

async function searchViaBrave(query: string, apiKey: string, limit: number) {
  const params = new URLSearchParams({ q: query, count: String(limit) });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Brave Search failed: HTTP ${res.status}`);
  const data = await res.json();
  const results = (data.web?.results || [])
    .slice(0, limit)
    .map((r: { title?: string; url?: string; description?: string }) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  return { query, results, provider: "brave", count: results.length };
}

async function searchViaFirecrawl(query: string, apiKey: string, limit: number) {
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, limit }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Firecrawl search failed: HTTP ${res.status}`);
  const data = await res.json();
  const raw = data.data || data.results || [];
  const results = (Array.isArray(raw) ? raw : [])
    .slice(0, limit)
    .map((r: { title?: string; url?: string; description?: string; markdown?: string }) => ({
      title: r.title,
      url: r.url,
      snippet: r.description || r.markdown?.slice(0, 200),
    }));
  return { query, results, provider: "firecrawl", count: results.length };
}

async function searchViaExa(
  query: string,
  apiKey: string,
  limit: number,
  baseUrl = "https://api.exa.ai",
): Promise<Record<string, unknown>> {
  return withRetry(
    "exa",
    async () => {
      const res = await fetch(`${normalizeProviderBaseUrl(baseUrl, "https://api.exa.ai")}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query,
          numResults: limit,
          contents: { text: true },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Exa search failed: HTTP ${res.status}`);
      const data = await readResponseBody(res);
      const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      const raw = Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : [];
      const results = raw
        .slice(0, limit)
        .map((r: Record<string, unknown>) => ({
          title: String(r.title || r.name || ""),
          url: String(r.url || r.link || ""),
          snippet: String(
            r.text ||
              r.content ||
              r.snippet ||
              r.summary ||
              (Array.isArray(r.highlights) ? r.highlights[0] : "") ||
              "",
          ).slice(0, 300),
        }))
        .filter((r: { url: string }) => !!r.url);
      return { query, results, provider: "exa", count: results.length };
    },
    2,
  );
}

async function searchViaParallel(
  query: string,
  apiKey: string,
  limit: number,
  baseUrl = "https://api.parallel.ai",
): Promise<Record<string, unknown>> {
  return withRetry(
    "parallel",
    async () => {
      const res = await fetch(
        `${normalizeProviderBaseUrl(baseUrl, "https://api.parallel.ai")}/v1/search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            objective: query,
            search_queries: buildSearchQueries(query),
            mode: "advanced",
            max_chars_total: Math.max(3000, limit * 1200),
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!res.ok) throw new Error(`Parallel search failed: HTTP ${res.status}`);
      const data = await readResponseBody(res);
      const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      const raw = Array.isArray(payload.results)
        ? payload.results
        : Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : [];
      const results = raw
        .slice(0, limit)
        .map((r: Record<string, unknown>) => ({
          title: String(r.title || r.name || ""),
          url: String(r.url || r.link || ""),
          snippet: String(r.content || r.text || r.snippet || r.excerpt || "").slice(0, 300),
        }))
        .filter((r: { url: string }) => !!r.url);
      return { query, results, provider: "parallel", count: results.length };
    },
    2,
  );
}

async function searchViaJina(
  query: string,
  limit: number,
  apiKey?: string,
): Promise<Record<string, unknown>> {
  return withRetry(
    "jina-search",
    async () => {
      // Jina AI Search — gratuito sem key, melhor com key. Substitui DuckDuckGo (Instant Answer
      // API que retornava vazio para queries técnicas). s.jina.ai retorna resultados reais.
      const headers: Record<string, string> = {
        Accept: "application/json",
        "X-Retain-Images": "none",
      };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Jina Search failed: HTTP ${res.status}`);
      const data = await res.json();

      const raw = data.data || [];
      const results = (Array.isArray(raw) ? raw : [])
        .slice(0, limit)
        .map((r: { title?: string; url?: string; content?: string; description?: string }) => ({
          title: r.title || "",
          url: r.url || "",
          snippet: (r.content || r.description || "").slice(0, 300),
        }))
        .filter((r: { url: string }) => r.url);

      return {
        query,
        results,
        provider: "jina",
        count: results.length,
      };
    },
    2,
  );
}

async function searchViaSearXNG(
  query: string,
  baseUrl: string,
  limit: number,
): Promise<Record<string, unknown>> {
  return withRetry(
    "searxng",
    async () => {
      // SearXNG — meta-search self-hosted (Google + Bing + DDG + Yandex agregados).
      // Precisa de baseUrl configurada pelo usuário (container Docker próprio).
      const url = new URL("search", baseUrl.replace(/\/$/, ""));
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("safesearch", "1");
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`SearXNG failed: HTTP ${res.status}`);
      const data = await res.json();
      const results = (data.results || [])
        .slice(0, limit)
        .map((r: { title?: string; url?: string; content?: string }) => ({
          title: r.title || "",
          url: r.url || "",
          snippet: (r.content || "").slice(0, 300),
        }))
        .filter((r: { url: string }) => r.url);
      return { query, results, provider: "searxng", count: results.length };
    },
    2,
  );
}

export type WebProviderPrefs = {
  /** Provider primário: auto | serper | tavily | brave | firecrawl | exa | parallel | jina | searxng. */
  primary?: string;
  /** Fallback (segundo provider). Default vira "jina" se não configurado. */
  fallback?: string;
  /** Base URL do SearXNG (se aplicável). */
  searxngBaseUrl?: string;
  /** Parser desejado para higienização final do conteúdo. */
  parser?: string;
};

type SearchFn = () => Promise<Record<string, unknown>>;

function resolveSearchProvider(
  providerName: string,
  query: string,
  limit: number,
  secrets: WebSecrets,
  prefs: WebProviderPrefs,
): SearchFn | null {
  switch (providerName) {
    case "serper": {
      const key = pickSecret(secrets, ["SERPER_API_KEY", "SERPER_KEY"]);
      return key ? () => searchViaSerper(query, key, limit) : null;
    }
    case "tavily": {
      const key = pickSecret(secrets, ["TAVILY_API_KEY"]);
      return key ? () => searchViaTavily(query, key, limit) : null;
    }
    case "brave": {
      const key = pickSecret(secrets, ["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"]);
      return key ? () => searchViaBrave(query, key, limit) : null;
    }
    case "firecrawl": {
      const key = pickSecret(secrets, ["FIRECRAWL_API_KEY"]);
      return key ? () => searchViaFirecrawl(query, key, limit) : null;
    }
    case "exa": {
      const key = pickSecret(secrets, ["EXA_API_KEY"]);
      const baseUrl = pickSecret(secrets, ["EXA_BASE_URL"]);
      return key ? () => searchViaExa(query, key, limit, baseUrl) : null;
    }
    case "parallel": {
      const key = pickSecret(secrets, ["PARALLEL_API_KEY"]);
      const baseUrl = pickSecret(secrets, ["PARALLEL_BASE_URL"]);
      return key ? () => searchViaParallel(query, key, limit, baseUrl) : null;
    }
    case "jina":
      return () => searchViaJina(query, limit, pickSecret(secrets, ["JINA_API_KEY"]));
    case "searxng":
      return prefs.searxngBaseUrl
        ? () => searchViaSearXNG(query, prefs.searxngBaseUrl as string, limit)
        : null;
    case "none":
      return null;
    default:
      return null;
  }
}

/**
 * Pesquisa web com modelo primary + fallback (máx 2 providers).
 * Default: se sem prefs/keys, primary=jina (gratuito, funciona out-of-the-box).
 * Inviolabilidade: nunca cascade cego — no máximo primary, depois fallback.
 */
export async function researchWebQuery(
  input: Record<string, unknown>,
  secrets: WebSecrets,
  prefs: WebProviderPrefs = {},
): Promise<Record<string, unknown>> {
  const query = String(input.query || input.q || input.text || "");
  if (!query) throw new Error("query is required");

  const limit = Math.min(Number(input.limit || input.max_results || 5), 20);
  const primaryName = String(prefs.primary || input.provider || "auto");
  const fallbackName = String(prefs.fallback || "jina");

  // Resolve primary. "auto" = primeiro provider pago com key, senão jina.
  let primaryFn: SearchFn | null = null;
  if (primaryName === "auto") {
    const paidProviders = ["exa", "parallel", "serper", "tavily", "brave", "firecrawl"];
    for (const name of paidProviders) {
      const fn = resolveSearchProvider(name, query, limit, secrets, prefs);
      if (fn) {
        primaryFn = fn;
        break;
      }
    }
    if (!primaryFn) primaryFn = resolveSearchProvider("jina", query, limit, secrets, prefs);
  } else {
    primaryFn = resolveSearchProvider(primaryName, query, limit, secrets, prefs);
    if (!primaryFn) {
      // Primary escolhido mas sem key — cai direto no fallback (default jina).
      console.warn(
        `[web_research] primary "${primaryName}" sem chave configurada, usando fallback`,
      );
    }
  }

  // Resolve fallback (default jina gratuito).
  const fallbackFn =
    resolveSearchProvider(fallbackName, query, limit, secrets, prefs) ??
    resolveSearchProvider("jina", query, limit, secrets, prefs);

  // Tenta primary, depois fallback. Máx 2 — nunca cascade cego.
  const attempts: Array<{ name: string; fn: SearchFn }> = [];
  if (primaryFn)
    attempts.push({ name: primaryName === "auto" ? "auto" : primaryName, fn: primaryFn });
  if (fallbackFn && fallbackName !== "none" && fallbackName !== primaryName) {
    attempts.push({ name: fallbackName, fn: fallbackFn });
  }

  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt.fn();
      if ((result.count as number) > 0) return result;
      lastErr = new Error(`${attempt.name}: sem resultados`);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[web_research] ${attempt.name} falhou:`, lastErr.message);
    }
  }

  // Ambos falharam ou retornaram vazio.
  return {
    query,
    results: [],
    provider: "none",
    count: 0,
    note: lastErr ? `Pesquisa indisponível: ${lastErr.message}` : "Sem resultados para esta query.",
  };
}

/**
 * Search + scrape encadeados: faz pesquisa, depois scrape do top-N URLs.
 * Retorna URLs + conteúdo markdown de cada resultado. Uma chamada = resultado completo.
 */
export async function researchAndScrape(
  input: Record<string, unknown>,
  secrets: WebSecrets,
  prefs: WebProviderPrefs = {},
): Promise<Record<string, unknown>> {
  const scrapeDepth = Math.min(
    Math.max(Number(input.scrape_depth || input.scrapeDepth || 3), 0),
    5,
  );
  const search = await researchWebQuery(input, secrets, prefs);
  const results = (search.results as Array<Record<string, unknown>>) ?? [];

  if (results.length === 0 || scrapeDepth === 0) {
    return { ...search, scraped: [] };
  }

  const topUrls = results.slice(0, scrapeDepth);
  const scraped: Array<{ url: string; title?: string; content?: string; provider?: string }> = [];

  // Scrape em paralelo (limitado ao top-N) com timeout individual.
  await Promise.all(
    topUrls.map(async (r) => {
      const url = String(r.url || "");
      if (!url) return;
      try {
        const page = await scrapeWebPage(
          { url, format: "markdown", mode: "read", only_main_content: true, parser: prefs.parser },
          secrets,
        );
        scraped.push({
          url,
          title: String(r.title || page.title || ""),
          content: String(page.content || "").slice(0, 8000),
          provider: String(page.provider || ""),
        });
      } catch (err) {
        console.warn(`[researchAndScrape] scrape falhou para ${url}:`, (err as Error).message);
        // Mantém o snippet mesmo sem scrape.
        scraped.push({
          url,
          title: String(r.title || ""),
          content: String(r.snippet || ""),
          provider: "snippet",
        });
      }
    }),
  );

  return {
    ...search,
    scraped,
  };
}
