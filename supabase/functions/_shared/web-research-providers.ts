/**
 * Provider-agnostic web scrape + search for agent runtime tools.
 * Tenant secrets (editor) drive provider choice; free fallbacks when unset.
 */

export type WebSecrets = Record<string, string>;

function pickSecret(secrets: WebSecrets, names: string[]): string | undefined {
  for (const name of names) {
    const v = secrets[name];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

async function scrapeViaJina(
  url: string,
  format: string,
  mode: string,
): Promise<Record<string, unknown>> {
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
}

async function scrapeViaFirecrawl(
  url: string,
  apiKey: string,
  input: Record<string, unknown>,
  format: string,
): Promise<Record<string, unknown>> {
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
}

async function scrapeViaHttp(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AetherForge/1.0 (web_scrape fallback)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`HTTP fetch failed: ${response.status}`);
  const html = await response.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50000);
  return {
    title: "",
    content: text,
    url,
    word_count: text.split(/\s+/).filter(Boolean).length,
    provider: "http",
  };
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

  if (firecrawlKey && (provider === "firecrawl" || provider === "auto")) {
    try {
      return await scrapeViaFirecrawl(url, firecrawlKey, input, format);
    } catch (err) {
      if (provider === "firecrawl") throw err;
      console.warn("[web_scrape] Firecrawl failed, trying fallback:", (err as Error).message);
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

async function searchViaDuckDuckGo(query: string, limit: number) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    no_html: "1",
    skip_disambig: "1",
  });
  const res = await fetch(`https://api.duckduckgo.com/?${params}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo failed: HTTP ${res.status}`);
  const data = await res.json();

  const results: { title: string; url: string; snippet: string }[] = [];
  if (data.AbstractURL && data.Abstract) {
    results.push({ title: data.Heading || query, url: data.AbstractURL, snippet: data.Abstract });
  }
  for (const topic of data.RelatedTopics || []) {
    if (results.length >= limit) break;
    if (topic.FirstURL && topic.Text) {
      results.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL, snippet: topic.Text });
    }
    for (const sub of topic.Topics || []) {
      if (results.length >= limit) break;
      if (sub.FirstURL && sub.Text) {
        results.push({ title: sub.Text.slice(0, 80), url: sub.FirstURL, snippet: sub.Text });
      }
    }
  }

  return {
    query,
    results: results.slice(0, limit),
    provider: "duckduckgo",
    count: results.length,
    note: results.length === 0 ? "No instant results; configure a search API key in agent secrets for richer results." : undefined,
  };
}

export async function researchWebQuery(
  input: Record<string, unknown>,
  secrets: WebSecrets,
): Promise<Record<string, unknown>> {
  const query = String(input.query || input.q || input.text || "");
  if (!query) throw new Error("query is required");

  const limit = Math.min(Number(input.limit || input.max_results || 5), 20);
  const provider = String(input.provider || "auto");

  const attempts: Array<() => Promise<Record<string, unknown>>> = [];

  const serperKey = pickSecret(secrets, ["SERPER_API_KEY", "SERPER_KEY"]);
  const tavilyKey = pickSecret(secrets, ["TAVILY_API_KEY"]);
  const braveKey = pickSecret(secrets, ["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"]);
  const firecrawlKey = pickSecret(secrets, ["FIRECRAWL_API_KEY"]);

  if (provider === "serper" && serperKey) attempts.push(() => searchViaSerper(query, serperKey, limit));
  if (provider === "tavily" && tavilyKey) attempts.push(() => searchViaTavily(query, tavilyKey, limit));
  if (provider === "brave" && braveKey) attempts.push(() => searchViaBrave(query, braveKey, limit));
  if (provider === "firecrawl" && firecrawlKey) attempts.push(() => searchViaFirecrawl(query, firecrawlKey, limit));
  if (provider === "duckduckgo") attempts.push(() => searchViaDuckDuckGo(query, limit));

  if (provider === "auto") {
    if (serperKey) attempts.push(() => searchViaSerper(query, serperKey, limit));
    if (tavilyKey) attempts.push(() => searchViaTavily(query, tavilyKey, limit));
    if (braveKey) attempts.push(() => searchViaBrave(query, braveKey, limit));
    if (firecrawlKey) attempts.push(() => searchViaFirecrawl(query, firecrawlKey, limit));
    attempts.push(() => searchViaDuckDuckGo(query, limit));
  }

  if (attempts.length === 0) {
    if (provider !== "auto" && provider !== "duckduckgo") {
      return {
        query,
        results: [],
        provider,
        count: 0,
        note: "Provedor sem chave configurada.",
      };
    }
    return searchViaDuckDuckGo(query, limit);
  }

  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if ((result.count as number) > 0 || provider !== "auto") return result;
      lastErr = new Error("empty results");
    } catch (err) {
      lastErr = err as Error;
      console.warn("[web_research] provider failed:", lastErr.message);
    }
  }

  if (provider !== "auto") throw lastErr || new Error("web_research failed");
  return searchViaDuckDuckGo(query, limit);
}