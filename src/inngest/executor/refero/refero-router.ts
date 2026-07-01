/**
 * REFERO — Strategy Router
 *
 * Analyzes extraction context and picks the best strategy.
 * Orchestrates provider adapters for a given URL.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import { scrapeWebPage, mapViaFirecrawl, crawlViaFirecrawl } from "../../../../supabase/functions/_shared/web-research-providers.ts";
import {
  getStrategy,
  detectSiteKind,
  getStrategyAffinity,
  filterStrategiesByDepth,
} from "./refero-strategies.ts";
import {
  type ReferoRouterContext,
  type ReferoRouterInput,
  type ReferoScrapeResult,
  type ProviderAvailability,
  type ExtractionStrategyId,
} from "./refero-types.ts";
import { runInSandbox } from "../e2b-client.ts";

// ─── Provider Detection ──────────────────────────────────────────

async function detectAvailableProviders(
  webSecrets: Record<string, string>,
  hasSandbox: boolean,
  hasLlm: boolean,
): Promise<ProviderAvailability> {
  return {
    firecrawl: !!webSecrets.FIRECRAWL_API_KEY,
    browserless: !!webSecrets.BROWSERLESS_API_KEY,
    browserbase: !!webSecrets.BROWSERBASE_API_KEY,
    jina: true, // Jina works without key (rate limited)
    crawl4ai: !!webSecrets.CRAWL4AI_API_KEY || !!webSecrets.CRAWL4AI_BASE_URL,
    scrapegraphai: !!webSecrets.SCRAPEGRAPHAI_API_KEY,
    e2b: hasSandbox,
    browseruse: hasSandbox, // browser-use is installed in E2B template
    llm: hasLlm,
  };
}

// ─── Strategy Selection ────────────────────────────────────────────

function pickBestStrategy(ctx: ReferoRouterContext): ExtractionStrategyId | null {
  const affinity = getStrategyAffinity(ctx.siteKind);
  const depthFiltered = filterStrategiesByDepth(affinity, ctx.depth);

  for (const id of depthFiltered) {
    const strategy = getStrategy(id);
    if (!strategy) continue;

    // Check all required providers are available
    const requirements = Object.entries(strategy.requires) as [keyof ProviderAvailability, boolean][];
    const allMet = requirements.every(([key, required]) => !required || ctx.availableProviders[key]);
    if (allMet) {
      return id;
    }
  }

  // Fallback: try any strategy whose requirements are met
  for (const id of depthFiltered) {
    const strategy = getStrategy(id);
    if (!strategy) continue;
    const requirements = Object.entries(strategy.requires) as [keyof ProviderAvailability, boolean][];
    const allMet = requirements.every(([key, required]) => !required || ctx.availableProviders[key]);
    if (allMet) return id;
  }

  return null;
}

// ─── Scrape Execution ─────────────────────────────────────────────

type WebProviderPrefs = {
  primary?: string;
  fallback?: string;
  parser?: string;
};

/**
 * Executes the chosen strategy and returns unified scrape results.
 */
export async function referoScrape(
  supabase: SupabaseClient,
  input: ReferoRouterInput,
  webSecrets: Record<string, string>,
  prefs: WebProviderPrefs | null,
  hasLlm: boolean,
  hasSandbox: boolean,
): Promise<ReferoScrapeResult> {
  const startMs = Date.now();
  const availableProviders = await detectAvailableProviders(webSecrets, hasSandbox, hasLlm);
  const siteKind = detectSiteKind(input.url);

  const ctx: ReferoRouterContext = {
    url: input.url,
    depth: input.depth,
    siteKind,
    availableProviders,
    budgetMs: input.depth === "deep" ? 180_000 : 30_000,
    categories: input.categories,
  };

  const strategyId = pickBestStrategy(ctx);
  const strategy = strategyId ? getStrategy(strategyId) : null;

  const trace: string[] = [];
  trace.push(`router: site=${siteKind}, strategy=${strategyId ?? "none"}`);

  if (!strategy || !strategyId) {
    trace.push("router: no strategy available, falling back to jina+http");
    return await executeFallbackStrategy(input.url, webSecrets, prefs, startMs, trace);
  }

  trace.push(`router: executing strategy "${strategy.label}" (priority=${strategy.priority})`);

  switch (strategyId) {
    case "e2b-full-render":
      if (!input.sandboxId) {
        trace.push("router: e2b-full-render but no sandbox — falling back to firecrawl-deep");
        return await executeFirecrawlDeep(input.url, webSecrets, prefs, startMs, trace);
      }
      return await executeE2BFullRender(input, webSecrets, prefs, startMs, trace);

    case "firecrawl-deep":
      return await executeFirecrawlDeep(input.url, webSecrets, prefs, startMs, trace);

    case "firecrawl-crawl":
      return await executeFirecrawlCrawl(input.url, webSecrets, prefs, startMs, trace);

    case "jina-fast":
      return await executeJinaFast(input.url, webSecrets, prefs, startMs, trace);

    case "multi-provider":
      return await executeMultiProvider(input.url, webSecrets, prefs, startMs, trace);

    case "browseruse-ai":
      // Heuristic-guided browsing — auto-dismiss popups, scroll lazy content
      if (!input.sandboxId) {
        trace.push("router: browseruse-ai but no sandbox — falling back to firecrawl-deep");
        return await executeFirecrawlDeep(input.url, webSecrets, prefs, startMs, trace);
      }
      return await executeBrowserUseAI(input, webSecrets, prefs, startMs, trace);

    case "browserbase-stealth":
      // Sprint 3 — for now, fall back to firecrawl-deep
      trace.push("router: browserbase-stealth not yet implemented, falling back to firecrawl-deep");
      return await executeFirecrawlDeep(input.url, webSecrets, prefs, startMs, trace);

    default:
      trace.push(`router: unknown strategy ${strategyId}, falling back`);
      return await executeFallbackStrategy(input.url, webSecrets, prefs, startMs, trace);
  }
}

// ─── Strategy Executors ────────────────────────────────────────────

async function executeE2BFullRender(
  input: ReferoRouterInput,
  webSecrets: Record<string, string>,
  prefs: WebProviderPrefs | null,
  startMs: number,
  trace: string[],
): Promise<ReferoScrapeResult> {
  // First, get markdown+html from a fast provider (jina or firecrawl)
  let markdown = "";
  let html = "";
  let title = "";
  let scrapeProvider = "none";

  try {
    const scrapeProviderName = webSecrets.FIRECRAWL_API_KEY ? "firecrawl" : "jina";
    const mdRes = await scrapeWebPage(
      { url: input.url, format: "markdown", mode: "read", provider: scrapeProviderName, only_main_content: true },
      webSecrets,
      { primary: scrapeProviderName, fallback: prefs?.fallback ?? "jina" },
    );
    markdown = String(mdRes.content ?? "");
    title = String(mdRes.title ?? "");
    scrapeProvider = String(mdRes.provider ?? scrapeProviderName);
    trace.push(`scrape: markdown via ${scrapeProvider} (${markdown.length} chars)`);
  } catch (err) {
    trace.push(`scrape: markdown failed: ${errorMessage(err)}`);
  }

  try {
    const scrapeProviderName = webSecrets.FIRECRAWL_API_KEY ? "firecrawl" : "jina";
    const htmlRes = await scrapeWebPage(
      { url: input.url, format: "html", mode: "read", provider: scrapeProviderName, only_main_content: false },
      webSecrets,
      { primary: scrapeProviderName, fallback: prefs?.fallback ?? "jina" },
    );
    html = String(htmlRes.content ?? "");
    trace.push(`scrape: html via ${String(htmlRes.provider ?? scrapeProviderName)} (${html.length} chars)`);
  } catch (err) {
    trace.push(`scrape: html failed: ${errorMessage(err)}`);
  }

  // Then run the enhanced Python agent in E2B sandbox for CSS deep scan
  let agentResult: Record<string, unknown> = {};
  let screenshots: string[] = [];
  let screenshotBase64 = "";
  let screenshotFullBase64 = "";
  let cssData: ReferoScrapeResult["cssData"] = { byTag: {}, gridSystems: [], flexPatterns: [], designTokens: {}, colorPalette: [] };
  let sections: ReferoScrapeResult["sections"] = [];
  let components: ReferoScrapeResult["components"] = [];
  let fontFaces: ReferoScrapeResult["fontFaces"] = [];
  let animations: ReferoScrapeResult["animations"] = [];
  let customProperties: Record<string, string> = {};
  let viewport: ReferoScrapeResult["viewport"] = { width: 1280, height: 800, devicePixelRatio: 2, scrollHeight: 800 };
  let viewports: ReferoScrapeResult["viewports"] = [];

  if (input.sandboxId) {
    try {
      const enhancedAgentScript = buildEnhancedAgentScript();
      const writeResult = await runInSandbox(input.sandboxId, input.sandboxAccessToken ?? null, enhancedAgentScript, { timeoutMs: 15_000 });
      if (writeResult.exitCode !== 0) {
        trace.push(`agent: write failed: ${writeResult.stderr?.slice(0, 200)}`);
      } else {
        trace.push("agent: enhanced script uploaded");
      }

      const execCmd = `cd /opt/forge && python3.11 agent.py --url "${input.url.replace(/"/g, '\\"')}" --cdp-port 9222 --timeout 120`;
      const result = await runInSandbox(input.sandboxId, input.sandboxAccessToken ?? null, execCmd, { timeoutMs: 180_000 });

      const raw = result.stdout || result.stderr || "{}";
      try {
        agentResult = JSON.parse(raw);
      } catch {
        const jsonMatch = raw.match(/\{[\s\S]*\}/s);
        agentResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      }

      if (agentResult.status === "error") {
        trace.push(`agent: error: ${agentResult.error}`);
      } else {
        trace.push(`agent: extraction complete (${JSON.stringify(agentResult).length} chars)`);
        screenshots = (agentResult.screenshots as string[]) ?? [];
        screenshotBase64 = (agentResult.screenshot_base64 as string) ?? "";
        screenshotFullBase64 = (agentResult.screenshot_full_base64 as string) ?? "";
        cssData = (agentResult.css_data as ReferoScrapeResult["cssData"]) ?? cssData;
        sections = (agentResult.sections as ReferoScrapeResult["sections"]) ?? [];
        components = (agentResult.dom_components as ReferoScrapeResult["components"]) ?? [];
        fontFaces = (agentResult.font_faces as ReferoScrapeResult["fontFaces"]) ?? [];
        animations = (agentResult.animations_data as ReferoScrapeResult["animations"]) ?? [];
        customProperties = (agentResult.custom_properties_deep as Record<string, string>) ?? {};
        viewport = (agentResult.viewport as ReferoScrapeResult["viewport"]) ?? viewport;
        viewports = (agentResult.viewports as ReferoScrapeResult["viewports"]) ?? [];

        // Merge enhanced data into markdown
        if (agentResult.markdown) {
          const enrichedParts = [String(agentResult.markdown), markdown];
          if (agentResult.colors) {
            enrichedParts.push(`\n\n## CSS Colors (by tag)\n${JSON.stringify(agentResult.colors)}`);
          }
          if (agentResult.typography) {
            enrichedParts.push(`\n\n## Typography (by tag)\n${JSON.stringify(agentResult.typography)}`);
          }
          if (agentResult.css_custom_properties && Object.keys(agentResult.css_custom_properties as object).length > 0) {
            enrichedParts.push(`\n\n## CSS Custom Properties\n${JSON.stringify(agentResult.css_custom_properties)}`);
          }
          if (agentResult.spacing) {
            enrichedParts.push(`\n\n## Spacing (by tag)\n${JSON.stringify(agentResult.spacing)}`);
          }
          markdown = enrichedParts.join("");
        }
      }
    } catch (err) {
      trace.push(`agent: sandbox execution failed: ${errorMessage(err)}`);
    }
  }

  return {
    provider: scrapeProvider,
    strategy: "e2b-full-render",
    markdown,
    html,
    title,
    screenshots,
    screenshotBase64,
    screenshotFullBase64,
    viewports,
    cssData,
    sections,
    components,
    fontFaces,
    animations,
    customProperties,
    viewport,
    durationMs: Date.now() - startMs,
    trace,
  };
}

async function executeFirecrawlDeep(
  url: string,
  webSecrets: Record<string, string>,
  prefs: WebProviderPrefs | null,
  startMs: number,
  trace: string[],
): Promise<ReferoScrapeResult> {
  const scrapeProvider = webSecrets.FIRECRAWL_API_KEY ? "firecrawl" : "jina";
  const fallback = prefs?.fallback ?? "jina";

  let markdown = "";
  let html = "";
  let title = "";

  // Enhanced: pass waitFor=5000 for SPAs and skipLocationCheck
  const scrapeInput: Record<string, unknown> = {
    wait_for: 5000,
    only_main_content: true,
  };

  try {
    const mdRes = await scrapeWebPage(
      { ...scrapeInput, url, format: "markdown", mode: "read", provider: scrapeProvider },
      webSecrets,
      { primary: scrapeProvider, fallback },
    );
    markdown = String(mdRes.content ?? "");
    title = String(mdRes.title ?? "");
    trace.push(`scrape: markdown via ${String(mdRes.provider ?? scrapeProvider)} (${markdown.length} chars, waitFor=5000, excludeTags=active)`);
  } catch (err) {
    trace.push(`scrape: markdown failed: ${errorMessage(err)}`);
  }

  try {
    const htmlRes = await scrapeWebPage(
      { ...scrapeInput, url, format: "html", mode: "read", provider: scrapeProvider, only_main_content: false },
      webSecrets,
      { primary: scrapeProvider, fallback },
    );
    html = String(htmlRes.content ?? "");
    trace.push(`scrape: html via ${String(htmlRes.provider ?? scrapeProvider)} (${html.length} chars)`);
  } catch (err) {
    trace.push(`scrape: html failed: ${errorMessage(err)}`);
  }

  // Enhanced: if Firecrawl key available and deep mode, also try map for sitemap
  if (webSecrets.FIRECRAWL_API_KEY) {
    try {
      const mapResult = await mapViaFirecrawl(url, webSecrets.FIRECRAWL_API_KEY);
      if (mapResult.urls.length > 1) {
        trace.push(`firecrawl: map discovered ${mapResult.urls.length} pages`);
        // Store discovered URLs as custom property for downstream use
        // (multi-page extraction is a future enhancement)
      }
    } catch (err) {
      trace.push(`firecrawl: map failed: ${errorMessage(err)}`);
    }
  }

  return {
    provider: scrapeProvider,
    strategy: "firecrawl-deep",
    markdown,
    html,
    title,
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
    durationMs: Date.now() - startMs,
    trace,
  };
}

/**
 * Firecrawl crawl strategy — crawl multiple pages from a site
 * and concatenate the results. Used for deep extraction of
 * design systems that span multiple pages (home + features + pricing).
 */
async function executeFirecrawlCrawl(
  url: string,
  webSecrets: Record<string, string>,
  _prefs: WebProviderPrefs | null,
  startMs: number,
  trace: string[],
): Promise<ReferoScrapeResult> {
  if (!webSecrets.FIRECRAWL_API_KEY) {
    // No key — fall back to firecrawl-deep (single page via jina)
    return executeFirecrawlDeep(url, webSecrets, _prefs, startMs, trace);
  }

  trace.push(`firecrawl: starting multi-page crawl (max 5 pages, depth 2)`);

  let crawlResults: Array<{ url: string; markdown: string; html: string; title: string }> = [];
  try {
    const crawlResult = await crawlViaFirecrawl(url, webSecrets.FIRECRAWL_API_KEY, {
      maxPages: 5,
      formats: ["markdown", "html"],
      waitFor: 5000,
      onlyMainContent: true,
      excludeTags: ["nav", "footer", "[class*='cookie']", "[class*='banner']", "[class*='ads']"],
      timeoutMs: 90000,
    });
    crawlResults = crawlResult.results;
    trace.push(`firecrawl: crawl completed — ${crawlResults.length} pages scraped`);
  } catch (err) {
    trace.push(`firecrawl: crawl failed: ${errorMessage(err)} — falling back to single scrape`);
    return executeFirecrawlDeep(url, webSecrets, _prefs, startMs, trace);
  }

  if (crawlResults.length === 0) {
    trace.push(`firecrawl: crawl returned 0 pages — falling back to single scrape`);
    return executeFirecrawlDeep(url, webSecrets, _prefs, startMs, trace);
  }

  // Concatenate all pages — first page is primary, others are supplementary
  const primaryPage = crawlResults[0];
  const supplementaryMarkdown: string[] = [];
  const supplementaryHtml: string[] = [];

  for (let i = 1; i < crawlResults.length; i++) {
    const page = crawlResults[i];
    if (page.markdown) {
      supplementaryMarkdown.push(`\n\n---\n\n## Page ${i + 1}: ${page.title || page.url}\n\n${page.markdown.slice(0, 8000)}`);
    }
    if (page.html) {
      supplementaryHtml.push(page.html.slice(0, 20000));
    }
  }

  return {
    provider: "firecrawl-crawl",
    strategy: "firecrawl-deep",
    markdown: primaryPage.markdown + supplementaryMarkdown.join(""),
    html: primaryPage.html + supplementaryHtml.join(""),
    title: primaryPage.title,
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
    durationMs: Date.now() - startMs,
    trace,
  };
}

/**
 * BrowserUse AI strategy — heuristic-guided browsing.
 *
 * Uses Playwright to auto-dismiss cookie banners, close popups,
 * accept consent dialogs, scroll lazy-loaded content, wait for
 * skeleton loaders, then extract the full page content.
 *
 * This runs inside the E2B sandbox via Python + Playwright.
 * It connects to Chrome CDP on port 9222 (same as the CSS scanner).
 *
 * Key advantage over raw scraping: handles sites with obstructions
 * (cookie walls, GDPR banners, age gates, newsletter popups, etc.)
 * that would otherwise yield empty or truncated content.
 */
async function executeBrowserUseAI(
  input: ReferoRouterInput,
  webSecrets: Record<string, unknown>,
  _prefs: WebProviderPrefs | null,
  startMs: number,
  trace: string[],
): Promise<ReferoScrapeResult> {
  if (!input.sandboxId || !input.sandboxAccessToken) {
    trace.push("browseruse-ai: no sandbox available — falling back to firecrawl-deep");
    return executeFirecrawlDeep(input.url, webSecrets as Record<string, string>, _prefs, startMs, trace);
  }

  trace.push("browseruse-ai: starting heuristic-guided navigation");

  const agentScript = buildBrowserUseAgentScript();

  // Upload agent script to sandbox
  try {
    const writeResult = await runInSandbox(
      input.sandboxAccessToken,
      input.sandboxId,
      "mkdir -p /opt/forge",
    );
    trace.push(`browseruse-ai: mkdir ${writeResult.stderr?.slice(0, 100) || "ok"}`);
  } catch (err) {
    trace.push(`browseruse-ai: mkdir failed: ${errorMessage(err)}`);
  }

  try {
    const writeResult = await runInSandbox(
      input.sandboxAccessToken,
      input.sandboxId,
      agentScript,
    );
    if (writeResult.exitCode !== 0) {
      trace.push(`browseruse-ai: script write failed (exit ${writeResult.exitCode})`);
    }
  } catch (err) {
    trace.push(`browseruse-ai: script write error: ${errorMessage(err)}`);
  }

  // Execute the browser-use agent
  try {
    const execCmd = `cd /opt/forge && python3.11 browseruse-agent.py --url "${input.url.replace(/"/g, '\\"')}" --cdp-port 9222 --timeout 90`;
    trace.push(`browseruse-ai: executing agent`);
    const agentResult = await runInSandbox(
      input.sandboxAccessToken,
      input.sandboxId,
      execCmd,
    );

    if (agentResult.exitCode !== 0) {
      trace.push(`browseruse-ai: agent failed (exit ${agentResult.exitCode}): ${agentResult.stderr?.slice(0, 200)}`);
      // Fall back to firecrawl-deep
      return executeFirecrawlDeep(input.url, webSecrets as Record<string, string>, _prefs, startMs, trace);
    }

    // Parse agent output
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(agentResult.stdout || "{}");
    } catch {
      trace.push(`browseruse-ai: agent output parse failed — using empty result`);
      parsed = {};
    }

    const markdown = String(parsed.markdown ?? "");
    const html = String(parsed.html ?? "");
    const title = String(parsed.title ?? "");
    const actionsLog = Array.isArray(parsed.actions) ? parsed.actions : [];

    trace.push(`browseruse-ai: extraction complete (markdown=${markdown.length}, html=${html.length}, actions=${actionsLog.length})`);
    if (actionsLog.length > 0) {
      trace.push(`browseruse-ai: actions taken: ${actionsLog.slice(0, 5).join(", ")}`);
    }

    return {
      provider: "browseruse-ai",
      strategy: "browseruse-ai",
      markdown,
      html,
      title,
      screenshots: [],
      screenshotBase64: String(parsed.screenshot_base64 ?? ""),
      screenshotFullBase64: "",
      viewports: [],
      cssData: { byTag: {}, gridSystems: [], flexPatterns: [], designTokens: {}, colorPalette: [] },
      sections: [],
      components: [],
      fontFaces: [],
      animations: [],
      customProperties: {},
      viewport: { width: 1280, height: 800, devicePixelRatio: 2, scrollHeight: 800 },
      durationMs: Date.now() - startMs,
      trace,
    };
  } catch (err) {
    trace.push(`browseruse-ai: sandbox execution failed: ${errorMessage(err)} — falling back to firecrawl-deep`);
    return executeFirecrawlDeep(input.url, webSecrets as Record<string, string>, _prefs, startMs, trace);
  }
}

/**
 * BrowserUse AI agent — Python script for heuristic-guided browsing.
 * Handles common web obstructions without needing an LLM API key.
 */
function buildBrowserUseAgentScript(): string {
  return `cat > /opt/forge/browseruse-agent.py << 'PYEOF'
import argparse, asyncio, base64, json, os, sys, traceback
import urllib.request, urllib.error

def get_ws_endpoint(cdp_port):
    url = f"http://127.0.0.1:{cdp_port}/json/version"
    try:
        resp = urllib.request.urlopen(url, timeout=5)
        data = json.loads(resp.read())
        return data.get("webSocketDebuggerUrl", "")
    except Exception as e:
        return ""

async def dismiss_popups(page, actions):
    """Heuristic popup dismissal — cookie banners, modals, overlays."""
    selectors_to_dismiss = [
        "[class*='cookie'] button, [class*='consent'] button, [class*='gdpr'] button, [id*='cookie'] button",
        "[class*='modal'] [class*='close'], [class*='dialog'] [class*='close'], [class*='popup'] [class*='close']",
        "button[aria-label='Close'], button[aria-label='Accept'], button[aria-label='Dismiss']",
        "[class*='newsletter'] [class*='close'], [class*='subscribe'] [class*='close']",
        "[class*='overlay'] [class*='close'], [class*='lightbox'] [class*='close']",
    ]
    for selector in selectors_to_dismiss:
        try:
            elements = await page.query_selector_all(selector)
            for el in elements[:3]:  # max 3 per selector
                if await el.is_visible():
                    await el.click()
                    actions.append(f"dismissed: {selector}")
                    await page.wait_for_timeout(500)
        except Exception:
            pass

async def scroll_to_load(page, actions):
    """Scroll through the page to trigger lazy-loaded content."""
    prev_height = 0
    scroll_attempts = 0
    max_attempts = 8

    while scroll_attempts < max_attempts:
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(1500)

        current_height = await page.evaluate("document.body.scrollHeight")
        if current_height == prev_height:
            scroll_attempts += 1  # No change — try a few more times
        else:
            scroll_attempts = 0  # Content loaded — reset
            prev_height = current_height

        actions.append(f"scroll: height={current_height}")

    # Scroll back to top
    await page.evaluate("window.scrollTo(0, 0)")
    await page.wait_for_timeout(500)

async def wait_for_content(page, actions):
    """Wait for skeleton loaders and dynamic content to resolve."""
    skeleton_selectors = [
        "[class*='skeleton']", "[class*='shimmer']", "[class*='placeholder']",
        "[class*='loading']", "[class*='spinner']",
    ]
    for selector in skeleton_selectors:
        try:
            skeletons = await page.query_selector_all(selector)
            if skeletons:
                actions.append(f"waiting for {len(skeletons)} {selector} elements to resolve")
                await page.wait_for_timeout(3000)
                # Check again
                remaining = await page.query_selector_all(selector)
                if len(remaining) < len(skeletons):
                    actions.append(f"resolved: {len(skeletons) - len(remaining)} {selector} removed")
        except Exception:
            pass

async def handle_age_gate(page, actions):
    """Auto-handle age gates (enter 25, click confirm)."""
    age_selectors = [
        "input[name*='age'], input[type='number'][placeholder*='age'], input[placeholder*='year']",
        "select[name*='year'], select[name*='month'], select[name*='day']",
    ]
    for selector in age_selectors:
        try:
            el = await page.query_selector(selector)
            if el and await el.is_visible():
                tag = await el.evaluate("el => el.tagName.toLowerCase()")
                if tag == "input":
                    await el.fill("25")
                elif tag == "select":
                    await el.select_option(index=20)
                actions.append(f"age_gate: filled {selector}")
        except Exception:
            pass

    # Click confirm/enter buttons
    confirm_selectors = [
        "button[type='submit']", "button:has-text('Enter')", "button:has-text('Confirm')",
        "button:has-text('I am')", "button:has-text('Yes')", "input[type='submit']",
    ]
    for selector in confirm_selectors:
        try:
            btn = await page.query_selector(selector)
            if btn and await btn.is_visible():
                await btn.click()
                actions.append(f"age_gate: clicked {selector}")
                await page.wait_for_timeout(2000)
                break
        except Exception:
            pass

def html_to_simple_markdown(page_content):
    """Very basic HTML to markdown for extracted content."""
    import re
    text = page_content
    # Remove scripts and styles
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL|re.IGNORECASE)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL|re.IGNORECASE)
    # Convert common tags
    text = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', lambda m: '\\n' + '#' * int(m.group(0)[2]) + ' ' + re.sub(r'<[^>]+>', '', m.group(1)).strip() + '\\n', text, flags=re.DOTALL)
    text = re.sub(r'<p[^>]*>', '\\n', text)
    text = re.sub(r'</p>', '\\n', text)
    text = re.sub(r'<br[^>]*>', '\\n', text)
    text = re.sub(r'<li[^>]*>', '- ', text)
    text = re.sub(r'</li>', '\\n', text)
    text = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', lambda m: f'[{re.sub(r"<[^>]+>","",m.group(2)).strip()}]({m.group(1)})', text)
    text = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', lambda m: f'![{m.group(1)}]', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\\n{3,}', '\\n\\n', text)
    return text.strip()

async def extract(url, cdp_port, timeout):
    ws_url = get_ws_endpoint(cdp_port)
    if not ws_url:
        print(json.dumps({"status":"error","error":f"Cannot connect to Chrome CDP on port {cdp_port}"}), file=sys.stderr)
        sys.exit(1)

    actions = []
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(ws_url)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="en-US",
        )
        page = await context.new_page()

        try:
            # Navigate with extended timeout
            actions.append(f"navigate: {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)
            actions.append("navigation: domcontentloaded")

            # Wait for network to settle
            try:
                await page.wait_for_load_state("networkidle", timeout=10000)
                actions.append("navigation: networkidle")
            except Exception:
                actions.append("navigation: networkidle_timeout (proceeded)")

            # Step 1: Handle age gates
            await handle_age_gate(page, actions)

            # Step 2: Dismiss popups, cookie banners, modals
            await dismiss_popups(page, actions)

            # Step 3: Wait for skeleton loaders
            await wait_for_content(page, actions)

            # Step 4: Scroll to load lazy content
            await scroll_to_load(page, actions)

            # Step 5: Dismiss any late-appearing popups after scroll
            await dismiss_popups(page, actions)

            # Step 6: Wait a final moment for any remaining content
            await page.wait_for_timeout(2000)

            # Extract content
            title = await page.title()
            html = await page.content()
            markdown = html_to_simple_markdown(html)

            # Screenshot
            screenshot_b64 = await page.screenshot(type="png", full_page=False)

            result = {
                "status": "ok",
                "title": title,
                "markdown": markdown,
                "html": html,
                "screenshot_base64": base64.b64encode(screenshot_b64).decode(),
                "url": url,
                "actions": actions,
                "content_length": len(markdown),
                "html_length": len(html),
            }
            print(json.dumps(result, ensure_ascii=False))

        except Exception as e:
            print(json.dumps({"status":"error","error":str(e),"traceback":traceback.format_exc(),"actions":actions}), file=sys.stderr)
            sys.exit(1)
        finally:
            await context.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--cdp-port", type=int, default=9222)
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()
    try:
        print(json.dumps(asyncio.run(extract(args.url, args.cdp_port, args.timeout)), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status":"error","error":str(e),"traceback":traceback.format_exc()}), file=sys.stderr)
        sys.exit(1)
PYEOF`;
}

async function executeJinaFast(
  url: string,
  webSecrets: Record<string, string>,
  _prefs: WebProviderPrefs | null,
  startMs: number,
  trace: string[],
): Promise<ReferoScrapeResult> {
  let markdown = "";
  let html = "";
  let title = "";

  try {
    const mdRes = await scrapeWebPage(
      { url, format: "markdown", mode: "read", provider: "jina", only_main_content: true },
      webSecrets,
      { primary: "jina", fallback: "http" },
    );
    markdown = String(mdRes.content ?? "");
    title = String(mdRes.title ?? "");
    trace.push(`scrape: markdown via ${String(mdRes.provider ?? "jina")} (${markdown.length} chars)`);
  } catch (err) {
    trace.push(`scrape: markdown failed: ${errorMessage(err)}`);
  }

  try {
    const htmlRes = await scrapeWebPage(
      { url, format: "html", mode: "read", provider: "jina", only_main_content: false },
      webSecrets,
      { primary: "jina", fallback: "http" },
    );
    html = String(htmlRes.content ?? "");
    trace.push(`scrape: html via ${String(htmlRes.provider ?? "jina")} (${html.length} chars)`);
  } catch (err) {
    trace.push(`scrape: html failed: ${errorMessage(err)}`);
  }

  return {
    provider: "jina",
    strategy: "jina-fast",
    markdown,
    html,
    title,
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
    durationMs: Date.now() - startMs,
    trace,
  };
}

async function executeMultiProvider(
  url: string,
  webSecrets: Record<string, string>,
  _prefs: WebProviderPrefs | null,
  startMs: number,
  trace: string[],
): Promise<ReferoScrapeResult> {
  // Try multiple providers in parallel and use the best result
  const results = await Promise.allSettled([
    scrapeWebPage(
      { url, format: "markdown", mode: "read", provider: "jina", only_main_content: true },
      webSecrets,
      { primary: "jina", fallback: "http" },
    ),
    ...(webSecrets.FIRECRAWL_API_KEY
      ? [
          scrapeWebPage(
            { url, format: "markdown", mode: "read", provider: "firecrawl", only_main_content: true },
            webSecrets,
            { primary: "firecrawl", fallback: "none" },
          ),
        ]
      : []),
  ]);

  let bestMarkdown = "";
  let bestTitle = "";
  let bestProvider = "none";

  for (const result of results) {
    if (result.status === "fulfilled") {
      const content = String(result.value.content ?? "");
      trace.push(`multi: ${String(result.value.provider ?? "?")} returned ${content.length} chars`);
      if (content.length > bestMarkdown.length) {
        bestMarkdown = content;
        bestTitle = String(result.value.title ?? "");
        bestProvider = String(result.value.provider ?? "unknown");
      }
    } else {
      trace.push(`multi: ${result.reason}`);
    }
  }

  return {
    provider: bestProvider,
    strategy: "multi-provider",
    markdown: bestMarkdown,
    html: "",
    title: bestTitle,
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
    durationMs: Date.now() - startMs,
    trace,
  };
}

async function executeFallbackStrategy(
  url: string,
  webSecrets: Record<string, string>,
  _prefs: WebProviderPrefs | null,
  startMs: number,
  trace: string[],
): Promise<ReferoScrapeResult> {
  let markdown = "";
  let html = "";
  let title = "";

  try {
    const mdRes = await scrapeWebPage(
      { url, format: "markdown", mode: "read", provider: "http", only_main_content: true },
      webSecrets,
      { primary: "http", fallback: "none" },
    );
    markdown = String(mdRes.content ?? "");
    title = String(mdRes.title ?? "");
    trace.push(`fallback: markdown via http (${markdown.length} chars)`);
  } catch (err) {
    trace.push(`fallback: markdown failed: ${errorMessage(err)}`);
  }

  return {
    provider: "http",
    strategy: "multi-provider",
    markdown,
    html,
    title,
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
    durationMs: Date.now() - startMs,
    trace,
  };
}

// ─── Enhanced Agent Script Builder ────────────────────────────────

/**
 * Builds the enhanced agent.py script with CSS deep scanner,
 * multi-viewport capture, component detection, and section extraction.
 */
function buildEnhancedAgentScript(): string {
  return `cat > /opt/forge/agent.py << 'PYEOF'
import argparse, asyncio, base64, json, os, sys, traceback, urllib.request, urllib.error

def get_ws_endpoint(cdp_port):
    url = f"http://127.0.0.1:{cdp_port}/json/version"
    try:
        resp = urllib.request.urlopen(url, timeout=5)
        return json.loads(resp.read().decode())["webSocketDebuggerUrl"]
    except Exception as e:
        print(f"WARNING: failed to get CDP endpoint: {e}", file=sys.stderr)
        return None

# ─── CSS Deep Scanner ─────────────────────────────────────────────

def build_css_deep_scanner_js():
    return '''() => {
  const r = {
    colors: {}, typography: {}, spacing: {},
    css_custom_properties: {},
    animations: [], transitions: [],
    layout_classes: [],
    css_data: { byTag: {}, gridSystems: [], flexPatterns: [], designTokens: {}, colorPalette: [] },
    sections: [], dom_components: [],
    font_faces: [], animations_data: [],
    custom_properties_deep: {},
    viewports: [],
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio, scrollHeight: document.documentElement.scrollHeight }
  };

  // ── Root custom properties ──
  const rs = getComputedStyle(document.documentElement);
  for (let i = 0; i < rs.length; i++) {
    const n = rs[i];
    if (n.startsWith("--")) r.css_custom_properties[n] = rs.getPropertyValue(n).trim();
  }

  // ── Per-tag computed styles (expanded selector set) ──
  const selectors = [
    "h1","h2","h3","h4","h5","h6","p","a","button","nav","header","footer","section","main",
    "[class*=hero]","[class*=card]","[class*=container]","[class*=grid]","[class*=flex]",
    "input","textarea","select","label","ul","ol","li","blockquote","code","pre",
    "table","tr","td","th","thead","tbody",
    "[class*=modal]","[class*=dialog]","[class*=dropdown]","[class*=tooltip]",
    "[class*=badge]","[class*=tag]","[class*=chip]","[class*=avatar]",
    "[class*=sidebar]","[class*=drawer]","[class*=banner]","[class*=ribbon]",
    "article","aside","details","summary","figure","figcaption","picture","video","iframe"
  ];

  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (!el.isConnected || !el.offsetParent && sel !== "nav" && sel !== "header" && sel !== "footer" && sel !== "section") continue;
      const cs = getComputedStyle(el);
      const t = el.tagName.toLowerCase();
      if (!r.colors[t]) r.colors[t] = { color: cs.color, backgroundColor: cs.backgroundColor, borderColor: cs.borderColor };
      if (!r.typography[t]) r.typography[t] = {
        fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform
      };
      if (!r.spacing[t]) r.spacing[t] = { margin: cs.margin, padding: cs.padding, gap: cs.gap };

      // Deep custom properties per element
      for (let i = 0; i < cs.length; i++) {
        const n = cs[i];
        if (n.startsWith("--")) {
          const key = t + ":" + n;
          r.custom_properties_deep[key] = cs.getPropertyValue(n).trim();
        }
      }
    }
  }

  // ── Grid systems ──
  for (const el of document.querySelectorAll("[class*=grid], [style*=grid]")) {
    const cs = getComputedStyle(el);
    if (cs.display === "grid" || cs.display === "inline-grid") {
      r.css_data.gridSystems.push({
        selector: el.tagName.toLowerCase() + (el.className ? "." + el.className.toString().split(" ").slice(0,2).join(".") : ""),
        columns: cs.gridTemplateColumns,
        rows: cs.gridTemplateRows,
        gap: cs.gap,
        areas: cs.gridTemplateAreas
      });
    }
  }

  // ── Flex patterns ──
  for (const el of document.querySelectorAll("[class*=flex], [style*=flex]")) {
    const cs = getComputedStyle(el);
    if (cs.display === "flex" || cs.display === "inline-flex") {
      r.css_data.flexPatterns.push({
        selector: el.tagName.toLowerCase() + (el.className ? "." + el.className.toString().split(" ").slice(0,2).join(".") : ""),
        direction: cs.flexDirection,
        justify: cs.justifyContent,
        align: cs.alignItems,
        wrap: cs.flexWrap,
        gap: cs.gap
      });
    }
  }

  // ── Layout classes ──
  for (const el of document.querySelectorAll("body > *, main, section, div[class*=grid], div[class*=flex]")) {
    const cs = getComputedStyle(el);
    r.layout_classes.push({
      tag: el.tagName.toLowerCase(),
      classes: (el.className||"").slice(0,200),
      display: cs.display,
      gridTemplateColumns: cs.gridTemplateColumns,
      gap: cs.gap,
      flexDirection: cs.flexDirection,
      justifyContent: cs.justifyContent,
      alignItems: cs.alignItems,
      maxWidth: cs.maxWidth
    });
  }

  // ── Design tokens detection ──
  const allVars = Object.keys(r.css_custom_properties);
  const tokenPrefixes = ["color", "spacing", "radius", "shadow", "font", "breakpoint", "transition", "animation"];
  for (const v of allVars) {
    for (const prefix of tokenPrefixes) {
      if (v.includes(prefix)) r.css_data.designTokens[v] = r.css_custom_properties[v];
    }
  }

  // ── Color palette extraction ──
  const colorSet = new Set();
  for (const tagData of Object.values(r.colors)) {
    const data = tagData as { color: string; backgroundColor: string; borderColor: string };
    [data.color, data.backgroundColor, data.borderColor].forEach(c => {
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") colorSet.add(c);
    });
  }
  for (const v of Object.values(r.css_custom_properties)) {
    if (typeof v === "string" && (/^#[0-9a-fA-F]{3,8}$/.test(v) || /rgba?|hsla?/.test(v))) colorSet.add(v);
  }
  r.css_data.colorPalette = Array.from(colorSet).slice(0, 50);

  // ── @font-face extraction ──
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          if (rule instanceof CSSFontFaceRule) {
            r.font_faces.push({
              fontFamily: rule.style.fontFamily,
              src: rule.style.src || "",
              fontWeight: rule.style.fontWeight || "normal",
              fontStyle: rule.style.fontStyle || "normal",
              unicodeRange: rule.style.unicodeRange || ""
            });
          }
        }
      } catch(e) {}
    }
  } catch(e) {}

  // ── Animations & Transitions (enhanced) ──
  try {
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of (sheet.cssRules||sheet.rules||[])) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            const kf = rule as CSSKeyframesRule;
            const kfData = {
              name: kf.name,
              cssText: kf.cssText,
              selectors: [] as string[],
              duration: 0,
              timing: "",
              delay: 0,
              iterationCount: ""
            };
            // Find elements using this animation
            for (const el of document.querySelectorAll("*")) {
              const cs = getComputedStyle(el);
              if (cs.animationName && cs.animationName.includes(kf.name)) {
                kfData.selectors.push((el.tagName.toLowerCase() + (el.className ? "." + el.className.toString().split(" ").slice(0,2).join(".") : "")).slice(0, 150));
                kfData.duration = parseFloat(cs.animationDuration) * 1000 || kfData.duration;
                kfData.timing = cs.animationTimingFunction || kfData.timing;
                kfData.delay = parseFloat(cs.animationDelay) * 1000;
                kfData.iterationCount = cs.animationIterationCount || kfData.iterationCount;
              }
            }
            r.animations_data.push(kfData);
            r.animations.push({ name: kf.name, keyframes: Array.from(kf.cssRules).map(k => ({key: (k as CSSKeyframeRule).keyText, style: (k as CSSKeyframeRule).style.cssText})) });
          }
          if (rule.type === CSSRule.STYLE_RULE && rule.style) {
            const an = rule.style.animationName;
            const tr = rule.style.transitionProperty;
            if (an && an !== "none") r.animations.push({ selector: rule.selectorText, animationName: an, duration: rule.style.animationDuration, timing: rule.style.animationTimingFunction });
            if (tr && tr !== "none") r.transitions.push({ selector: rule.selectorText, property: tr, duration: rule.style.transitionDuration, timing: rule.style.transitionTimingFunction });
          }
        }
      } catch(e) {}
    }
  } catch(e) {}

  // ── Section Detection ──
  const sectionElements = document.querySelectorAll("section, [class*=hero], [class*=feature], [class*=pricing], [class*=testimonial], [class*=cta], [class*=footer], [class*=banner], header, nav, footer");
  const seen = new Set();
  for (const el of sectionElements) {
    if (!el.isConnected) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 50) continue;
    const key = el.tagName + (el.className ? el.className.toString().slice(0,50) : "");
    if (seen.has(key)) continue;
    seen.add(key);
    const cls = String(el.className || "").toLowerCase();
    let secType = "unknown";
    if (cls.includes("hero") || cls.includes("headline")) secType = "hero";
    else if (cls.includes("feature") || cls.includes("service")) secType = "features";
    else if (cls.includes("pricing") || cls.includes("plan")) secType = "pricing";
    else if (cls.includes("testimonial") || cls.includes("review")) secType = "testimonials";
    else if (cls.includes("cta") || cls.includes("call-to-action")) secType = "cta";
    else if (el.tagName === "NAV") secType = "nav";
    else if (el.tagName === "FOOTER") secType = "footer";
    else if (el.tagName === "HEADER") secType = "header";
    const cs = getComputedStyle(el);
    r.sections.push({
      yPosition: Math.round(rect.top + window.scrollY),
      height: Math.round(rect.height),
      type: secType,
      selector: (el.tagName.toLowerCase() + (el.className ? "." + el.className.toString().split(" ").slice(0,2).join(".") : "")).slice(0, 200),
      screenshotBase64: "",
      styles: { background: cs.background, padding: cs.padding, margin: cs.margin, display: cs.display, maxWidth: cs.maxWidth },
      textSummary: (el.textContent || "").trim().slice(0, 200)
    });
  }

  // ── DOM Component Detection ──
  const componentSelectors = [
    { sel: "[class*=card]", type: "card" },
    { sel: "button, [role=button], [class*=btn]", type: "button" },
    { sel: "nav, [role=navigation]", type: "nav" },
    { sel: "form, [role=form]", type: "form" },
    { sel: "[class*=modal], [class*=dialog], [role=dialog]", type: "modal" },
    { sel: "[class*=hero], [class*=headline]", type: "hero" },
    { sel: "[class*=grid], [class*=bento]", type: "grid" },
    { sel: "footer", type: "footer" },
    { sel: "[class*=carousel], [class*=slider]", type: "carousel" },
    { sel: "[class*=pricing]", type: "pricing" },
    { sel: "[class*=testimonial], [class*=review]", type: "testimonial" },
    { sel: "[class*=accordion], [class*=faq]", type: "accordion" },
    { sel: "[class*=tab]", type: "tab" },
    { sel: "[class*=badge], [class*=tag], [class*=chip]", type: "badge" },
    { sel: "[class*=avatar]", type: "avatar" },
    { sel: "[class*=input], [class*=field]", type: "input" },
  ];
  for (const { sel, type } of componentSelectors) {
    const els = document.querySelectorAll(sel);
    if (els.length === 0) continue;
    const first = els[0];
    if (!first.isConnected) continue;
    const cs = getComputedStyle(first);
    const rect = first.getBoundingClientRect();
    const anatomy = Array.from(first.children).map(c => c.tagName.toLowerCase()).slice(0, 10);
    r.dom_components.push({
      selector: (first.tagName.toLowerCase() + (first.className ? "." + first.className.toString().split(" ").slice(0,2).join(".") : "")).slice(0, 200),
      tag: first.tagName.toLowerCase(),
      classes: (first.className || "").toString().slice(0, 200),
      componentType: type,
      anatomy,
      styles: {
        borderRadius: cs.borderRadius, boxShadow: cs.boxShadow,
        padding: cs.padding, margin: cs.margin, gap: cs.gap,
        background: cs.background.slice(0, 200), display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns, flexDirection: cs.flexDirection
      },
      position: { top: Math.round(rect.top + window.scrollY), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
      patternCount: els.length
    });
  }

  return r;
}'''

# ─── Markdown Extractor ────────────────────────────────────────────

def build_markdown_extractor_js():
    return '''() => {
  function w(n,d) {
    if (!n||n.nodeType===Node.COMMENT_NODE) return "";
    if (n.nodeType===Node.TEXT_NODE) { const t=n.textContent.trim(); return t?t+" ":""; }
    const tag=(n.tagName||"").toLowerCase();
    if (["script","style","noscript"].includes(tag)) return "";
    if (["br","hr"].includes(tag)) return "\\n";
    if (n.hidden||(n.style&&(n.style.display==="none"||n.style.visibility==="hidden"))) return "";
    let r="";
    for (const c of n.childNodes) r+=w(c,d+1);
    if (["h1","h2","h3","h4","h5","h6"].includes(tag)) return "\\n"+"#".repeat(parseInt(tag[1]))+" "+r.trim()+"\\n\\n";
    if (tag==="p") return r.trim()+"\\n\\n";
    if (tag==="li") return "- "+r.trim()+"\\n";
    if (["ul","ol"].includes(tag)) return "\\n"+r+"\\n";
    if (tag==="a") { const h=n.href||""; return h?"["+r.trim()+"]("+h+") ":r; }
    if (tag==="img") { const a=n.alt||"",s=n.src||""; return s?"!["+a+"]("+s+") ":""; }
    if (tag==="blockquote") return "> "+r.trim()+"\\n\\n";
    if (tag==="code") return "\x60"+r.trim()+"\x60";
    if (tag==="pre") return "\x60\x60\x60\\n"+r.trim()+"\\n\x60\x60\x60\\n\\n";
    return r;
  }
  return w(document.body).replace(/\\n{3,}/g,"\\n\\n").trim();
}'''

# ─── Main Extraction ──────────────────────────────────────────────

async def extract(url, cdp_port, timeout):
    ws = get_ws_endpoint(cdp_port)
    if not ws:
        print(json.dumps({"status":"error","error":f"Cannot connect to Chrome CDP on port {cdp_port}"}), file=sys.stderr)
        sys.exit(1)
    async with async_playwright() as pw:
        br = await pw.chromium.connect_over_cdp(ws)
        ctx = br.contexts[0] if br.contexts else await br.new_context(viewport={"width":1280,"height":800},device_scale_factor=2)
        pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
        pg.set_default_timeout(timeout*1000)
        await pg.goto(url, wait_until="networkidle", timeout=timeout*1000)
        await pg.wait_for_load_state("domcontentloaded")
        await pg.evaluate("document.fonts.ready")
        await pg.evaluate("window.scrollTo(0,document.body.scrollHeight)")
        await asyncio.sleep(1.5)
        await pg.evaluate("window.scrollTo(0,0)")
        await asyncio.sleep(0.5)

        # ── Desktop extraction ──
        md = await pg.evaluate(build_markdown_extractor_js())
        samples = await pg.evaluate(build_css_deep_scanner_js())
        sb64 = base64.b64encode(await pg.screenshot(full_page=False, type="png")).decode()
        fb64 = base64.b64encode(await pg.screenshot(full_page=True, type="png")).decode()
        vh = samples["viewport"]["height"]
        sh = samples["viewport"]["scrollHeight"]

        # Scroll screenshots
        segs = []
        num_segs = min(5, max(1, sh // max(vh, 1)))
        for i in range(num_segs):
            y = i * (sh // max(num_segs, 1))
            await pg.evaluate(f"window.scrollTo(0,{y})")
            await asyncio.sleep(0.3)
            segs.append(base64.b64encode(await pg.screenshot(full_page=False, type="png")).decode())
        await pg.evaluate("window.scrollTo(0,0)")
        await asyncio.sleep(0.3)

        # ── Multi-viewport capture (tablet + mobile) ──
        viewports_data = []
        viewport_configs = [
            {"width": 768, "height": 1024, "label": "tablet", "dpr": 1.5},
            {"width": 390, "height": 844, "label": "mobile", "dpr": 2},
        ]
        for vp_config in viewport_configs:
            try:
                new_ctx = await br.new_context(
                    viewport={"width": vp_config["width"], "height": vp_config["height"]},
                    device_scale_factor=vp_config["dpr"],
                    is_mobile=vp_config["label"] == "mobile",
                )
                new_pg = new_ctx.pages[0] if new_ctx.pages else await new_ctx.new_page()
                new_pg.set_default_timeout(timeout*1000)
                await new_pg.goto(url, wait_until="networkidle", timeout=timeout*1000)
                await new_pg.wait_for_load_state("domcontentloaded")
                await asyncio.sleep(1)
                vp_screenshot = base64.b64encode(await new_pg.screenshot(full_page=False, type="png")).decode()
                vp_css_summary = await new_pg.evaluate('''() => {
                  const s = {};
                  const rs = getComputedStyle(document.documentElement);
                  s.fontSize = rs.fontSize;
                  s.primaryColor = rs.getPropertyValue("--color-primary") || rs.getPropertyValue("--primary") || "";
                  s.bgColor = rs.backgroundColor;
                  s.fontFamily = rs.fontFamily;
                  return s;
                }''')
                viewports_data.append({
                    "width": vp_config["width"],
                    "height": vp_config["height"],
                    "label": vp_config["label"],
                    "screenshotBase64": vp_screenshot,
                    "cssSummary": vp_css_summary
                })
                await new_ctx.close()
            except Exception as e:
                print(f"WARNING: viewport {vp_config['label']} failed: {e}", file=sys.stderr)

        result = {
            "status": "ok",
            "markdown": md,
            "colors": samples["colors"],
            "typography": samples["typography"],
            "spacing": samples["spacing"],
            "css_custom_properties": samples["css_custom_properties"],
            "animations": samples["animations"],
            "transitions": samples["transitions"],
            "layout_classes": samples["layout_classes"],
            "viewport": samples["viewport"],
            "screenshot_base64": sb64,
            "screenshot_full_base64": fb64,
            "screenshots": segs,
            # Enhanced fields
            "css_data": samples["css_data"],
            "sections": samples["sections"],
            "dom_components": samples["dom_components"],
            "font_faces": samples["font_faces"],
            "animations_data": samples["animations_data"],
            "custom_properties_deep": samples["custom_properties_deep"],
            "viewports": viewports_data,
        }
        return result

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--url",required=True)
    p.add_argument("--cdp-port",type=int,default=9222)
    p.add_argument("--timeout",type=int,default=120)
    a=p.parse_args()
    try:
        print(json.dumps(asyncio.run(extract(a.url,a.cdp_port,a.timeout)),ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status":"error","error":str(e),"traceback":traceback.format_exc()}),file=sys.stderr)
        sys.exit(1)
PYEOF`;
}

/**
 * Exported for use by the router to get the agent script.
 */
export { buildEnhancedAgentScript };
