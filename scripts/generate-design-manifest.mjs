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
    if (!id) continue;
    out.push({ id, name: name ?? id, category: category ?? "full_page", serves_domains });
  }
  return out;
}

function parseVisualLanguages() {
  const src = read("tokens/languages.ts");
  const out = [];
  for (const m of src.matchAll(/^\s{2}(\w+):\s*\{/gm)) {
    const id = m[1];
    const chunk = src.slice(m.index, m.index + 800);
    const name = chunk.match(/name:\s*"([^"]+)"/)?.[1] ?? id;
    const servesBlock = chunk.match(/serves:\s*\[([^\]]+)\]/)?.[1] ?? "";
    const serves = [...servesBlock.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    out.push({ id, name, serves });
  }
  return out;
}

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