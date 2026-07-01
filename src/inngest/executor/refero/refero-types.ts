/**
 * REFERO — Design DNA Extraction Engine
 * Unified types for the Refero extraction pipeline.
 */

// ─── Extraction Context ───────────────────────────────────────────

export type ExtractionDepth = "shallow" | "deep";

export type SiteKind =
  | "landing_page"
  | "saas_app"
  | "ecommerce"
  | "portfolio"
  | "documentation"
  | "blog"
  | "news"
  | "unknown";

export type ExtractionStrategyId =
  | "firecrawl-deep"
  | "firecrawl-crawl"
  | "browserbase-stealth"
  | "browseruse-ai"
  | "jina-fast"
  | "multi-provider"
  | "e2b-full-render";

// ─── Provider Availability ────────────────────────────────────────

export type ProviderAvailability = {
  firecrawl: boolean;
  browserless: boolean;
  browserbase: boolean;
  jina: boolean;
  crawl4ai: boolean;
  scrapegraphai: boolean;
  e2b: boolean; // sandbox available
  browseruse: boolean; // browser-use pip installed (E2B template)
  llm: boolean; // LLM configured for AI-guided browsing
};

// ─── Strategy Definition ──────────────────────────────────────────

export type ExtractionStrategy = {
  id: ExtractionStrategyId;
  label: string;
  description: string;
  /** Which providers are REQUIRED for this strategy */
  requires: Partial<ProviderAvailability>;
  /** Priority score (higher = preferred). Router picks highest-scoring viable strategy. */
  priority: number;
  /** Estimated time in seconds for a single URL */
  estimatedTimeSec: number;
  /** Whether this strategy supports deep extraction */
  supportsDeep: boolean;
};

// ─── Scrape Result (unified) ──────────────────────────────────────

export type ReferoScrapeResult = {
  /** Which provider/strategy produced this result */
  provider: string;
  strategy: ExtractionStrategyId;

  /** Raw content from the scrape */
  markdown: string;
  html: string;
  title: string;

  /** Screenshots in base64 */
  screenshots: string[];
  /** Primary screenshot (desktop) */
  screenshotBase64: string;
  /** Full page screenshot */
  screenshotFullBase64: string;

  /** Multi-viewport data (if collected) */
  viewports: ViewportData[];

  /** CSS deep scan results (if collected) */
  cssData: CssDeepScan;

  /** Section map (if collected) */
  sections: SectionData[];

  /** DOM component detection results */
  components: DetectedComponent[];

  /** Font face declarations extracted */
  fontFaces: FontFaceDeclaration[];

  /** Animation/keyframe data */
  animations: AnimationData[];

  /** CSS custom properties collected (beyond root) */
  customProperties: Record<string, string>;

  /** Page metadata */
  viewport: { width: number; height: number; devicePixelRatio: number; scrollHeight: number };

  /** Timing info */
  durationMs: number;

  /** Trace for debugging */
  trace: string[];
};

// ─── Viewport Data ────────────────────────────────────────────────

export type ViewportData = {
  width: number;
  height: number;
  label: string; // "desktop" | "tablet" | "mobile"
  screenshotBase64: string;
  cssSummary: Record<string, unknown>;
};

// ─── CSS Deep Scan ────────────────────────────────────────────────

export type CssDeepScan = {
  /** Per-tag computed styles */
  byTag: Record<string, Record<string, string>>;
  /** Grid systems detected */
  gridSystems: GridSystemInfo[];
  /** Flex patterns detected */
  flexPatterns: FlexPatternInfo[];
  /** Design tokens detected from CSS custom property naming */
  designTokens: Record<string, string>;
  /** Color palette extracted from all computed styles */
  colorPalette: string[];
};

export type GridSystemInfo = {
  selector: string;
  columns: string;
  rows: string;
  gap: string;
  areas: string;
};

export type FlexPatternInfo = {
  selector: string;
  direction: string;
  justify: string;
  align: string;
  wrap: string;
  gap: string;
};

// ─── Section Detection ────────────────────────────────────────────

export type SectionData = {
  /** Y position in scroll */
  yPosition: number;
  /** Height in px */
  height: number;
  /** Detected section type */
  type: string; // "hero" | "features" | "pricing" | "testimonials" | "cta" | "footer" | "nav" | "unknown"
  /** CSS selector for this section */
  selector: string;
  /** Screenshot of this section */
  screenshotBase64: string;
  /** Key CSS styles */
  styles: Record<string, string>;
  /** Text content summary (first 200 chars) */
  textSummary: string;
};

// ─── DOM Component Detection ──────────────────────────────────────

export type DetectedComponent = {
  /** CSS selector (unique-ish) */
  selector: string;
  /** Tag name */
  tag: string;
  /** Classes */
  classes: string;
  /** Detected component type */
  componentType: string; // "card" | "button" | "nav" | "form" | "modal" | "hero" | "grid" | "footer" | "unknown"
  /** Direct children anatomy */
  anatomy: string[];
  /** Key computed styles */
  styles: {
    borderRadius: string;
    boxShadow: string;
    padding: string;
    margin: string;
    gap: string;
    background: string;
    display: string;
    gridTemplateColumns: string;
    flexDirection: string;
  };
  /** Position in viewport */
  position: { top: number; left: number; width: number; height: number };
  /** How many elements share this pattern */
  patternCount: number;
};

// ─── Font Face ────────────────────────────────────────────────────

export type FontFaceDeclaration = {
  fontFamily: string;
  src: string;
  fontWeight: string;
  fontStyle: string;
  unicodeRange: string;
};

// ─── Animation Data ───────────────────────────────────────────────

export type AnimationData = {
  /** CSS @keyframes name */
  name: string;
  /** Full keyframe CSS text */
  cssText: string;
  /** Elements using this animation */
  selectors: string[];
  /** Duration in ms */
  duration: number;
  /** Timing function */
  timing: string;
  /** Delay in ms */
  delay: number;
  /** Iteration count */
  iterationCount: string;
};

// ─── DNA Validation ───────────────────────────────────────────────

export type DNAValidation = {
  /** Overall quality score 0-100 */
  score: number;
  /** % of fields filled (not null/empty) */
  completeness: number;
  /** Cross-field consistency check */
  consistency: number;
  /** Are values specific or generic? */
  specificity: number;
  /** Can a builder actually use these values to code? */
  actionability: number;
  /** Problems found */
  issues: string[];
  /** Auto-fixes applied */
  autoFixes: string[];
};

// ─── Router Input ─────────────────────────────────────────────────

export type ReferoRouterInput = {
  url: string;
  depth: ExtractionDepth;
  categories: string[];
  userId: string;
  sandboxId?: string;
  sandboxAccessToken?: string;
};

export type ReferoRouterContext = {
  url: string;
  depth: ExtractionDepth;
  siteKind: SiteKind;
  availableProviders: ProviderAvailability;
  budgetMs: number;
  categories: string[];
};
