#!/usr/bin/env node
/**
 * Gera design_manifest.generated.json a partir de packages/forge-ui.
 * Uso: node scripts/generate-design-manifest.mjs
 *      node scripts/generate-design-manifest.mjs --check
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FORGE_UI = path.join(ROOT, "packages/forge-ui/src");
const OUT_JSON = path.join(ROOT, "supabase/functions/agent-run/design_manifest.generated.json");

/** Lista legada em design-enforcement.ts — 29 nomes sem código. */
const LEGACY_KNOWN_FORGE_COMPOSITES = [
  "HeroSignature",
  "BentoGrid",
  "FeatureMatrix",
  "CTASignature",
  "NavShell",
  "StatsRibbon",
  "PricingTiers",
  "TestimonialCarousel",
  "FooterColumns",
  "LogoWall",
  "FAQAccordion",
  "TeamGrid",
  "MarqueeStrip",
  "SplitFeature",
  "MediaGallery",
  "ContactForm",
  "NewsletterSignup",
  "AppScreenshot",
  "ComparisonTable",
  "TimelineVertical",
  "ProcessSteps",
  "TrustBar",
  "CaseStudyCard",
  "AnnouncementBar",
  "StickyCTA",
  "SplitHero",
  "VideoHero",
  "ProductShowcase",
  "ServiceGrid",
  "LocationMap",
  "BookingWidget",
  "ReviewGrid",
  "GalleryMasonry",
  "PressMentions",
  "IntegrationGrid",
  "DashboardPreview",
  "MetricCards",
  "OnboardingSteps",
];

function read(rel) {
  return fs.readFileSync(path.join(FORGE_UI, rel), "utf8");
}

function parseExportNames(ts, fromPattern = /export\s*\{\s*([^}]+)\s*\}/g) {
  const names = [];
  for (const m of ts.matchAll(fromPattern)) {
    const block = m[1];
    for (const part of block.split(",")) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("type ")) continue;
      const name = trimmed.split(/\s+as\s+/)[0].trim();
      if (name && /^[A-Z]/.test(name)) names.push(name);
    }
  }
  return names;
}

function parseCompositionsBasic() {
  const BASIC = [
    "BentoGrid",
    "HeroSignature",
    "FeatureMatrix",
    "StatsRibbon",
    "CTASignature",
    "NavShell",
    "FooterColumns",
    "PricingTiers",
    "TestimonialCarousel",
  ];
  return BASIC.map((exportName) => ({
    export: exportName,
    file: `composites/${exportName}.tsx`,
  }));
}

function parseOpinionated() {
  const src = read("compositions/opinionated/index.ts");
  const blocks = src.split(/\n\s*\{\n/).slice(1);
  const out = [];
  for (const block of blocks) {
    const id = block.match(/id:\s*"([^"]+)"/)?.[1];
    const name = block.match(/name:\s*"([^"]+)"/)?.[1];
    const moment = block.match(/moment:\s*"([^"]+)"/)?.[1];
    const code_path = block.match(/code_path:\s*"([^"]+)"/)?.[1];
    if (!id || !code_path) continue;
    const voice = [...block.matchAll(/voice:\s*\[([^\]]+)\]/g)].map((m) =>
      [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    )[0] ?? [];
    const techniques = [...block.matchAll(/techniques:\s*\[([^\]]+)\]/g)].map((m) =>
      [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    )[0] ?? [];
    const compatible_moods = [...block.matchAll(/compatible_moods:\s*\[([^\]]+)\]/g)].map((m) =>
      [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
    )[0] ?? [];
    const fileName = path.basename(code_path, ".tsx");
    out.push({
      id,
      name: name ?? fileName,
      export: fileName,
      moment: moment ?? "",
      voice,
      techniques,
      compatible_moods,
      code_path: `packages/forge-ui/src/${code_path}`,
      sandbox_read_path: `packages/forge-ui/src/${code_path}`,
    });
  }
  return out;
}

function parseTechniques() {
  const dir = path.join(FORGE_UI, "techniques");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts");
  const out = [];
  for (const file of files.sort()) {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    const id = content.match(/id:\s*"([^"]+)"/)?.[1];
    const name = content.match(/name:\s*"([^"]+)"/)?.[1];
    const concept = content.match(/concept:\s*"([^"]+)"/)?.[1];
    if (!id) continue;
    out.push({
      id,
      name: name ?? id,
      concept: concept ?? "",
      file_path: `packages/forge-ui/src/techniques/${file}`,
      sandbox_read_path: `packages/forge-ui/src/techniques/${file}`,
    });
  }
  return out;
}

function parseDnaSeeds() {
  const src = read("design-dna/seeds.ts");
  const blocks = src.split(/\n\s*\{\n/).slice(1);
  const out = [];
  for (const block of blocks) {
    const id = block.match(/id:\s*"([^"]+)"/)?.[1];
    const name = block.match(/name:\s*"([^"]+)"/)?.[1];
    const category = block.match(/category:\s*"([^"]+)"/)?.[1];
    const serves = block.match(/serves_domains:\s*\[([^\]]+)\]/)?.[1];
    const serves_domains = serves ? [...serves.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
    const layoutType = block.match(/type:\s*"([^"]+)"/)?.[1] ?? "";
    const motionChoreo = block.match(/scroll_choreography:\s*"([^"]+)"/)?.[1] ?? "";
    const typoNotes = block.match(/notes:\s*"([^"]+)"/)?.[1] ?? "";
    const langs = block.match(/compatible_languages:\s*\[([^\]]+)\]/)?.[1];
    const compatible_languages = langs ? [...langs.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
    const moods = block.match(/compatible_moods:\s*\[([^\]]+)\]/)?.[1];
    const compatible_moods = moods ? [...moods.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
    const summaryRaw = [layoutType, motionChoreo, typoNotes].filter(Boolean).join(" · ");
    const summary = summaryRaw.slice(0, 500);
    const seedPath = `packages/forge-ui/src/design-dna/seeds.ts`;
    if (!id) continue;
    out.push({
      id,
      name: name ?? id,
      category: category ?? "full_page",
      serves_domains,
      compatible_languages,
      compatible_moods,
      summary,
      sandbox_read_path: seedPath,
    });
  }
  return out;
}

function extractBalancedBlocks(src, entryRe) {
  const out = [];
  let m;
  while ((m = entryRe.exec(src)) !== null) {
    const id = m[1];
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    out.push({ id, block: src.slice(m.index, i) });
  }
  return out;
}

function parseStringArray(block, key) {
  const re = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`, "s");
  const hit = block.match(re)?.[1] ?? "";
  return [...hit.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function parseCombinesWith(block) {
  const out = [];
  for (const m of block.matchAll(
    /\{\s*id:\s*"([^"]+)",\s*reasoning:\s*"([^"]+)",\s*moment:\s*"([^"]+)"\s*\}/g,
  )) {
    out.push({ id: m[1], reasoning: m[2], moment: m[3] });
  }
  return out;
}

function parseVisualLanguages() {
  const src = read("tokens/languages.ts");
  const blocks = extractBalancedBlocks(src, /^\s{2}"?([\w-]+)"?:\s*\{/gm);
  const out = [];
  for (const { id, block } of blocks) {
    if (id === "export" || id === "combines_with" || block.includes("Record<string")) continue;
    if (out.some((row) => row.id === id)) continue;
    const name = block.match(/name:\s*"([^"]+)"/)?.[1] ?? id;
    out.push({
      id,
      name,
      serves: parseStringArray(block, "serves"),
      combines_with: parseCombinesWith(block),
      conflicts_with: parseStringArray(block, "conflicts_with"),
      anti_patterns: parseStringArray(block, "anti_patterns"),
      compatible_moods: parseStringArray(block, "compatible_moods"),
      reference_queries: parseStringArray(block, "reference_queries"),
      principles: parseStringArray(block, "principles"),
    });
  }
  return out;
}

/** Assinaturas regex para design-validate (manifest = fonte única). */
const TECHNIQUE_SIGNATURE_PATTERNS = {
  "parallax-depth": ["Parallax", "useScrollProgress", "parallax"],
  "animated-mesh-background": ["mesh", "@keyframes", "AnimatedMesh", "meshColors"],
  "grain-texture-overlay": ["GrainArtisanalOverlay", "mix-blend-mode:\\s*overlay", "grain"],
  "sticky-stack": ["StickyStackNarrative", "position:\\s*sticky"],
  "scroll-reveal": ["Reveal", "StaggerContainer", "FadeIn"],
  "kinetic-typography": ["KineticHeadlineReveal", "TextShimmer", "kinetic"],
  "spotlight-cursor": ["Spotlight", "spotlight"],
  "magnetic-interaction": ["MagneticButton", "magnetic"],
  "tilt-hover": ["Tilt3D", "tilt"],
  "count-up-metrics": ["CountUp", "count-up", "tabular-nums"],
  "infinite-marquee": ["Marquee", "marquee", "animate-marquee"],
  "glassmorphism-layers": ["backdrop-blur", "glassmorphism", "GlassNavFloating"],
  "smooth-scroll-lenis": ["Lenis", "smooth-scroll", "SmoothScrollLenis"],
  "section-tabs-visual": ["SectionTabsFeatureLanes", "section-tabs", "defaultLaneId"],
  "process-steps-scroll": ["ProcessStepsHowItWorks", "process-steps"],
  "logo-marquee-social-proof": ["logo-marquee", "LogoMarquee", "infinite-marquee"],
  "interactive-demo-embed": ["InteractiveHeroDemo", "interactive-demo", "demoCaption"],
};

function buildTechniqueSignatures(techniques) {
  return techniques.map((t) => ({
    id: t.id,
    patterns: TECHNIQUE_SIGNATURE_PATTERNS[t.id] ?? [t.name, t.id],
  }));
}

function buildCompositionSignatures(opinionated) {
  return opinionated.map((c) => ({
    id: c.id,
    export: c.export,
    pattern: c.export,
  }));
}

function buildOpinionatedHeroExports(opinionated) {
  return opinionated
    .filter((c) => c.id.startsWith("hero-") || c.export === "InteractiveHeroDemo")
    .map((c) => c.export);
}

/** Mapeamento seção → ids de composição para resolve por sections[]. */
const SECTION_COMPOSITION_MAP = {
  hero: ["hero-editorial-split", "hero-brutalist-typography", "hero-cinematic-spotlight", "interactive-hero-demo"],
  features: ["bento-dense-showcase", "spotlight-showcase-grid", "section-tabs-feature-lanes"],
  narrative: ["sticky-stack-narrative", "editorial-magazine-split", "parallax-product-showcase"],
  tabs: ["section-tabs-feature-lanes"],
  steps: ["process-steps-how-it-works"],
  faq: ["faq-accordion-craft"],
  nav: ["glass-nav-floating"],
  overlay: ["grain-artisanal-overlay"],
  showcase: ["kinetic-headline-reveal", "bento-dense-showcase"],
};

function parseMotionPrimitives() {
  const src = read("components/Motion.tsx");
  return [...src.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
}

function parsePrimitives() {
  const src = read("components/index.ts");
  return parseExportNames(src).filter((n) => !n.endsWith("Variants") && n !== "ForgeToaster");
}

function buildManifest() {
  const compositions_basic = parseCompositionsBasic();
  const compositions_opinionated = parseOpinionated();
  const techniques = parseTechniques();
  const dna_seeds = parseDnaSeeds();
  const visual_languages = parseVisualLanguages();
  const motion_primitives = parseMotionPrimitives();
  const primitives = parsePrimitives();

  const composite_exports = [
    ...compositions_basic.map((c) => c.export),
    ...compositions_opinionated.map((c) => c.export),
  ];
  const catalog_exports = [...new Set([...composite_exports, ...primitives, ...motion_primitives])];
  const phantom_banned = LEGACY_KNOWN_FORGE_COMPOSITES.filter((n) => !composite_exports.includes(n));

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    compositions_basic,
    compositions_opinionated,
    techniques,
    dna_seeds,
    visual_languages,
    motion_primitives,
    primitives,
    composite_exports,
    catalog_exports,
    phantom_banned,
    opinionated_hero_exports: buildOpinionatedHeroExports(compositions_opinionated),
    composition_signatures: buildCompositionSignatures(compositions_opinionated),
    technique_signatures: buildTechniqueSignatures(techniques),
    section_composition_map: SECTION_COMPOSITION_MAP,
  };
}

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

const check = process.argv.includes("--check");
const manifest = buildManifest();
const next = stableStringify(manifest);

function stripVolatile(m) {
  const { generated_at: _g, ...rest } = m;
  return rest;
}

if (check) {
  if (!fs.existsSync(OUT_JSON)) {
    console.error("[design-manifest] Arquivo ausente:", OUT_JSON);
    process.exit(1);
  }
  const current = JSON.parse(fs.readFileSync(OUT_JSON, "utf8"));
  if (JSON.stringify(stripVolatile(current)) !== JSON.stringify(stripVolatile(manifest))) {
    console.error("[design-manifest] design_manifest.generated.json desatualizado. Rode: npm run design:manifest");
    process.exit(1);
  }
  console.log("[design-manifest] OK — manifest sincronizado");
  process.exit(0);
}

fs.writeFileSync(OUT_JSON, next);
console.log(
  `[design-manifest] ${manifest.compositions_basic.length} básicos, ${manifest.compositions_opinionated.length} opinionated, ${manifest.techniques.length} técnicas, ${manifest.phantom_banned.length} phantoms → ${OUT_JSON}`,
);