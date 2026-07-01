/**
 * REFERO — Extraction Strategy Definitions
 *
 * Each strategy defines which providers it needs, when to use it,
 * and what capabilities it provides. The router picks the best strategy
 * based on context.
 */

import type { ExtractionStrategy, ExtractionStrategyId, SiteKind, ExtractionDepth } from "./refero-types.ts";

// ─── Strategy Catalog ────────────────────────────────────────────

export const STRATEGIES: ExtractionStrategy[] = [
  {
    id: "e2b-full-render",
    label: "E2B Full Render",
    description: "Full browser render in E2B sandbox with enhanced CSS scanning, multi-viewport, and component detection. Best quality for deep extraction.",
    requires: { e2b: true },
    priority: 90,
    estimatedTimeSec: 45,
    supportsDeep: true,
  },
  {
    id: "firecrawl-deep",
    label: "Firecrawl Deep Scrape",
    description: "Firecrawl API with waitFor for SPA rendering, clean markdown extraction, and optional screenshot. Good for JS-heavy sites.",
    requires: { firecrawl: true },
    priority: 80,
    estimatedTimeSec: 15,
    supportsDeep: true,
  },
  {
    id: "browseruse-ai",
    label: "BrowserUse AI Navigation",
    description: "AI-guided browser navigation using BrowserUse library. Closes popups, accepts cookies, scrolls lazy content, then extracts. Best for sites with obstructions.",
    requires: { e2b: true, browseruse: true, llm: true },
    priority: 85,
    estimatedTimeSec: 60,
    supportsDeep: true,
  },
  {
    id: "browserbase-stealth",
    label: "Browserbase Stealth Browser",
    description: "Real cloud browser with anti-detect capabilities. Bypasses Cloudflare, Akamai, hCaptcha. Best for protected sites.",
    requires: { browserbase: true },
    priority: 70,
    estimatedTimeSec: 20,
    supportsDeep: true,
  },
  {
    id: "jina-fast",
    label: "Jina Fast Reader",
    description: "Jina Reader API for fast markdown extraction. Best for static sites, blogs, documentation. Lightweight and fast.",
    requires: { jina: true },
    priority: 50,
    estimatedTimeSec: 5,
    supportsDeep: false,
  },
  {
    id: "multi-provider",
    label: "Multi-Provider Parallel",
    description: "Runs 2-3 providers in parallel and merges results. Good fallback when no single provider is reliable.",
    requires: {},
    priority: 30,
    estimatedTimeSec: 20,
    supportsDeep: false,
  },
];

// ─── Strategy Lookup ──────────────────────────────────────────────

const strategyById = new Map(STRATEGIES.map((s) => [s.id, s]));

export function getStrategy(id: ExtractionStrategyId): ExtractionStrategy | undefined {
  return strategyById.get(id);
}

// ─── Site Detection Hints ────────────────────────────────────────

/**
 * Simple heuristic to detect site kind from URL.
 * Not perfect, but helps the router make better decisions.
 */
export function detectSiteKind(url: string): SiteKind {
  const host = new URL(url).hostname.toLowerCase();
  const path = new URL(url).pathname.toLowerCase();

  // Documentation sites
  if (
    host.includes("docs.") ||
    host.includes("documentation.") ||
    path.startsWith("/docs") ||
    host.includes("readthedocs") ||
    host.includes("docusaurus") ||
    host.includes("gitbook")
  ) {
    return "documentation";
  }

  // Blog/news
  if (
    host.includes("blog.") ||
    host.includes("medium.com") ||
    host.includes("substack.com") ||
    host.includes("dev.to") ||
    host.includes("hashnode") ||
    host.includes("news.") ||
    host.includes("nytimes.com") ||
    host.includes("bbc.com")
  ) {
    return path.includes("/post") || path.includes("/article") ? "blog" : "news";
  }

  // E-commerce
  if (
    host.includes("shopify.com") ||
    host.includes("amazon.") ||
    host.includes("store.") ||
    host.includes("shop.") ||
    host.includes("merch.") ||
    host.includes("woocommerce")
  ) {
    return "ecommerce";
  }

  // SaaS apps (common patterns)
  if (
    host.includes("app.") ||
    host.includes("dashboard.") ||
    host.includes("admin.") ||
    host.includes("portal.")
  ) {
    return "saas_app";
  }

  // Portfolio
  if (
    host.includes("portfolio") ||
    host.includes("dribbble.com") ||
    host.includes("behance.net") ||
    host.includes("figma.com") ||
    path.includes("/portfolio") ||
    path.includes("/work")
  ) {
    return "portfolio";
  }

  return "landing_page";
}

// ─── Strategy Affinity Matrix ─────────────────────────────────────

/**
 * Maps site kinds to preferred strategy order.
 * The router uses this to bias toward certain strategies
 * based on what kind of site it's extracting.
 */
const STRATEGY_AFFINITY: Record<SiteKind, ExtractionStrategyId[]> = {
  landing_page: ["e2b-full-render", "firecrawl-deep", "browseruse-ai", "jina-fast"],
  saas_app: ["browseruse-ai", "firecrawl-deep", "e2b-full-render", "browserbase-stealth"],
  ecommerce: ["firecrawl-deep", "browserbase-stealth", "e2b-full-render", "multi-provider"],
  portfolio: ["e2b-full-render", "firecrawl-deep", "jina-fast", "browseruse-ai"],
  documentation: ["jina-fast", "firecrawl-deep", "multi-provider"],
  blog: ["jina-fast", "firecrawl-deep", "multi-provider"],
  news: ["jina-fast", "firecrawl-deep", "multi-provider"],
  unknown: ["firecrawl-deep", "e2b-full-render", "jina-fast", "multi-provider"],
};

export function getStrategyAffinity(siteKind: SiteKind): ExtractionStrategyId[] {
  return STRATEGY_AFFINITY[siteKind] ?? STRATEGY_AFFINITY.unknown;
}

// ─── Depth Requirements ───────────────────────────────────────────

/**
 * Strategies that require deep mode for full functionality.
 * In shallow mode, these get downgraded.
 */
export function filterStrategiesByDepth(
  strategyIds: ExtractionStrategyId[],
  depth: ExtractionDepth,
): ExtractionStrategyId[] {
  if (depth === "deep") return strategyIds;
  // In shallow mode, prefer fast strategies
  return strategyIds.filter((id) => {
    const strategy = getStrategy(id);
    return strategy?.supportsDeep === false || id === "jina-fast" || id === "firecrawl-deep";
  });
}
