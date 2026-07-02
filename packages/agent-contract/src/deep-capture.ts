// @forge/agent-contract — Escopo DEEP (captures qualificados, Refero-class).
//
// SSOT: packages/agent-contract/src/deep-capture.ts
// SYNC: npm run sync:agent-contract → supabase/functions/_shared/agent-contract-deep-capture.ts
// EXECUTOR: src/lib/agent-deep-capture-contract.ts

export type ScopeIntent = "landing" | "full_site" | "curated" | "custom";
export type ScopePages = "single" | "sitemap" | "user_list";
export type ScopeFolds = "auto" | "all" | "hero_only";

export type CaptureStats = {
  qualified: number;
  rejected: number;
  pages: number;
};

export type NavigationReportPage = {
  url: string;
  title: string;
  foldsCaptured: number;
  sections: Array<{ type: string; label: string; captureId: string }>;
};

export type NavigationReport = {
  jobId: string;
  version: number;
  scope: ExtractionScope;
  pagesVisited: NavigationReportPage[];
  capturesQualified: number;
  capturesRejected: number;
  highlights: string[];
  motionObservations: string[];
  typographyNotes: string[];
  colorNotes: string[];
  componentInventory: string[];
  gaps: string[];
  userInstructionsApplied: string[];
  updatedAt: string;
};

export type ExtractionScope = {
  level: number;
  intent: ScopeIntent;
  pages: ScopePages;
  folds: ScopeFolds;
  viewports: Array<"desktop" | "tablet" | "mobile">;
  categories: string[];
  pageUrls?: string[];
  excludeSelectors?: string[];
  capturePolicy: {
    minQualifiedCaptures: number;
    maxCaptures: number | null;
    qualifyEach: true;
  };
  reportPolicy: {
    partialEveryNCaptures: number;
    finalReport: true;
  };
};

export const DEFAULT_DEEP_CATEGORIES = [
  "hero",
  "motion",
  "typography",
  "color_application",
  "components",
  "interactions",
] as const;

/** Scope Level 7 — landing, todas as dobras, desktop (spec DESIGN_DNA_DEEP_CAPTURE_SPEC §1.4). */
export const DEFAULT_EXTRACTION_SCOPE: ExtractionScope = {
  level: 7,
  intent: "landing",
  pages: "single",
  folds: "auto",
  viewports: ["desktop"],
  categories: [...DEFAULT_DEEP_CATEGORIES],
  capturePolicy: {
    minQualifiedCaptures: 3,
    maxCaptures: null,
    qualifyEach: true,
  },
  reportPolicy: {
    partialEveryNCaptures: 10,
    finalReport: true,
  },
};

function isScopeIntent(v: unknown): v is ScopeIntent {
  return v === "landing" || v === "full_site" || v === "curated" || v === "custom";
}

function isScopePages(v: unknown): v is ScopePages {
  return v === "single" || v === "sitemap" || v === "user_list";
}

function isScopeFolds(v: unknown): v is ScopeFolds {
  return v === "auto" || v === "all" || v === "hero_only";
}

function isViewportLabel(v: unknown): v is "desktop" | "tablet" | "mobile" {
  return v === "desktop" || v === "tablet" || v === "mobile";
}

/** Snapshot imutável no schedule do job DEEP. */
export function snapshotExtractionScope(categories?: string[]): ExtractionScope {
  const cats =
    Array.isArray(categories) && categories.length > 0
      ? categories.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim())
      : [...DEFAULT_DEEP_CATEGORIES];
  return {
    ...DEFAULT_EXTRACTION_SCOPE,
    categories: cats,
  };
}

/** Normaliza meta.scope persistido ou parcial. */
export function parseExtractionScope(raw: unknown, fallbackCategories?: string[]): ExtractionScope {
  const base = snapshotExtractionScope(fallbackCategories);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const r = raw as Record<string, unknown>;

  const level = typeof r.level === "number" && r.level > 0 ? r.level : base.level;
  const intent = isScopeIntent(r.intent) ? r.intent : base.intent;
  const pages = isScopePages(r.pages) ? r.pages : base.pages;
  const folds = isScopeFolds(r.folds) ? r.folds : base.folds;

  const viewports = Array.isArray(r.viewports)
    ? (r.viewports.filter(isViewportLabel) as ExtractionScope["viewports"])
    : base.viewports;
  const categories = Array.isArray(r.categories)
    ? r.categories.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : base.categories;

  const pageUrls = Array.isArray(r.pageUrls)
    ? r.pageUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : undefined;
  const excludeSelectors = Array.isArray(r.excludeSelectors)
    ? r.excludeSelectors.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : undefined;

  const cp = r.capturePolicy as Record<string, unknown> | undefined;
  const rp = r.reportPolicy as Record<string, unknown> | undefined;

  return {
    level,
    intent,
    pages,
    folds,
    viewports: viewports.length > 0 ? viewports : base.viewports,
    categories: categories.length > 0 ? categories : base.categories,
    pageUrls,
    excludeSelectors,
    capturePolicy: {
      minQualifiedCaptures:
        typeof cp?.minQualifiedCaptures === "number" ? cp.minQualifiedCaptures : base.capturePolicy.minQualifiedCaptures,
      maxCaptures:
        cp?.maxCaptures === null
          ? null
          : typeof cp?.maxCaptures === "number"
            ? cp.maxCaptures
            : base.capturePolicy.maxCaptures,
      qualifyEach: true,
    },
    reportPolicy: {
      partialEveryNCaptures:
        typeof rp?.partialEveryNCaptures === "number"
          ? rp.partialEveryNCaptures
          : base.reportPolicy.partialEveryNCaptures,
      finalReport: true,
    },
  };
}