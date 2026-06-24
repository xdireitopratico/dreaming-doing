/**
 * Provider-agnostic web scrape + search for agent runtime tools.
 * Tenant secrets (editor) drive provider choice; free fallbacks when unset.
 */

declare const Deno: {
  env: { get(name: string): string | undefined };
};

import { htmlToMarkdownDocument, htmlToVisibleText } from "../../../src/lib/html-hygiene.ts";

export type WebSecrets = Record<string, string>;

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
      const transient = /timeout|429|5\d\d|network|fetch failed|ECONNRESET|ETIMEDOUT|rate limit/i.test(message);
      if (!transient || attempt === attempts - 1) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[web_scrape] ${label} retry ${attempt + 1}/${attempts}: ${message}`);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function scrapeViaJina(
  url: string,
  format: string,
  mode: string,
): Promise<Record<string, unknown>> {
  return withRetry("jina", async () => {
    const jinaUrl = mode === "screenshot"
      ? `https://s.jina.ai/${encodeURIComponent(url)}`
      : `https://r.jina.ai/${encodeURIComponent(url)}`;

    const headers: Record<string, string> = { Accept: "application/json" };
    if (format === "html") headers["X-Return-Format"] = "html";

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
  }, 2);
}

async function scrapeViaBrowserless(
  url: string,
  apiKey: string,
  input: Record<string, unknown>,
  format: string,
): Promise<Record<string, unknown>> {
  return withRetry("browserless", async () => {
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
      throw new Error(`Browserless content failed: HTTP ${response.status} — ${errText.substring(0, 200)}`);
    }

    const html = await response.text();
    const content = format === "html" ? html : htmlToMarkdownDocument(html) || htmlToVisibleText(html);
    return {
      title: "",
      content,
      url,
      word_count: content.split(/\s+/).filter(Boolean).length,
      provider: "browserless",
    };
  }, 2);
}

async function scrapeViaFirecrawl(
  url: string,
  apiKey: string,
  input: Record<string, unknown>,
  format: string,
): Promise<Record<string, unknown>> {
  return withRetry("firecrawl", async () => {
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
      throw new Error(`Firecrawl scrape failed: HTTP ${fcResponse.status} — ${errText.substring(0, 200)}`);
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
  }, 2);
}

async function scrapeViaHttp(url: string): Promise<Record<string, unknown>> {
  return withRetry("http", async () => {
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
  }, 2);
}

export async function scrapeWebPage(
  input: Record<string, unknown>,
  secrets: WebSecrets,
): Promise<Record<string, unknown>> {
  const url = String(input.url || "");
  if (!url) throw new Error("url is required");

  const mode = String(input.mode || "read");
  const format = String(input.format || "markdown");
  const provider = String(input.provider || "auto");
  const firecrawlKey = pickSecret(secrets, ["FIRECRAWL_API_KEY"]);
  const browserlessKey = pickSecret(secrets, ["BROWSERLESS_API_KEY"]);

  if (firecrawlKey && (provider === "firecrawl" || provider === "auto")) {
    try {
      return await scrapeViaFirecrawl(url, firecrawlKey, input, format);
    } catch (err) {
      if (provider === "firecrawl") throw err;
      console.warn("[web_scrape] Firecrawl failed, trying fallback:", (err as Error).message);
    }
  }

  if (browserlessKey && mode !== "screenshot" && (provider === "browserless" || provider === "auto")) {
    try {
      return await scrapeViaBrowserless(url, browserlessKey, input, format);
    } catch (err) {
      if (provider === "browserless") throw err;
      console.warn("[web_scrape] Browserless failed, trying fallback:", (err as Error).message);
    }
  }

  if (provider === "http") {
    return scrapeViaHttp(url);
  }

  if (provider !== "firecrawl") {
    try {
      return await scrapeViaJina(url, format, mode);
    } catch (err) {
      if (provider === "jina") throw err;
      console.warn("[web_scrape] Jina failed, trying HTTP:", (err as Error).message);
    }
  }

  return scrapeViaHttp(url);
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
  const results = (data.organic || []).slice(0, limit).map((r: { title?: string; link?: string; snippet?: string }) => ({
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
  const results = (data.results || []).map((r: { title?: string; url?: string; content?: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
  }));
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
  const results = (data.web?.results || []).slice(0, limit).map((r: { title?: string; url?: string; description?: string }) => ({
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
  const results = (Array.isArray(raw) ? raw : []).slice(0, limit).map((r: { title?: string; url?: string; description?: string; markdown?: string }) => ({
    title: r.title,
    url: r.url,
    snippet: r.description || r.markdown?.slice(0, 200),
  }));
  return { query, results, provider: "firecrawl", count: results.length };
}

async function searchViaJina(query: string, limit: number): Promise<Record<string, unknown>> {
  return withRetry("jina-search", async () => {
    // Jina AI Search — gratuito sem key, melhor com key. Substitui DuckDuckGo (Instant Answer
    // API que retornava vazio para queries técnicas). s.jina.ai retorna resultados reais.
    const jinaKey = Deno.env.get("JINA_API_KEY");
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Retain-Images": "none",
    };
    if (jinaKey) headers["Authorization"] = `Bearer ${jinaKey}`;

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
  }, 2);
}

async function searchViaSearXNG(
  query: string,
  baseUrl: string,
  limit: number,
): Promise<Record<string, unknown>> {
  return withRetry("searxng", async () => {
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
  }, 2);
}

export type WebProviderPrefs = {
  /** Provider primário: auto | serper | tavily | brave | firecrawl | jina | searxng. */
  primary?: string;
  /** Fallback (segundo provider). Default vira "jina" se não configurado. */
  fallback?: string;
  /** Base URL do SearXNG (se aplicável). */
  searxngBaseUrl?: string;
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
    case "jina":
      return () => searchViaJina(query, limit);
    case "searxng":
      return prefs.searxngBaseUrl
        ? () => searchViaSearXNG(query, prefs.searxngBaseUrl as string, limit)
        : null;
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
    const paidProviders = ["serper", "tavily", "brave", "firecrawl"];
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
      console.warn(`[web_research] primary "${primaryName}" sem chave configurada, usando fallback`);
    }
  }

  // Resolve fallback (default jina gratuito).
  const fallbackFn =
    resolveSearchProvider(fallbackName, query, limit, secrets, prefs) ??
    resolveSearchProvider("jina", query, limit, secrets, prefs);

  // Tenta primary, depois fallback. Máx 2 — nunca cascade cego.
  const attempts: Array<{ name: string; fn: SearchFn }> = [];
  if (primaryFn) attempts.push({ name: primaryName === "auto" ? "auto" : primaryName, fn: primaryFn });
  if (fallbackFn && fallbackFn !== primaryFn) {
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
    note: lastErr
      ? `Pesquisa indisponível: ${lastErr.message}`
      : "Sem resultados para esta query.",
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
  const scrapeDepth = Math.min(Math.max(Number(input.scrape_depth || input.scrapeDepth || 3), 0), 5);
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
          { url, format: "markdown", mode: "read", only_main_content: true },
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
