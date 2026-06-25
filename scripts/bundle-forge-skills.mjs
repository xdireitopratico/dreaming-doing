#!/usr/bin/env node
/**
 * Copia SKILL.md reais para supabase/functions/_shared/forge-skills/{id}.md
 * Rode após adicionar skills ao catálogo: node scripts/bundle-forge-skills.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "supabase/functions/_shared/forge-skills");
const HOME = os.homedir();

const VERCEL_SKILLS = path.join(
  HOME,
  ".claude/plugins/cache/claude-plugins-official/vercel/0.43.0/skills",
);

/** id do catálogo FORGE → caminho absoluto do SKILL.md */
const SOURCES = {
  brainstorming: path.join(HOME, ".agents/skills/brainstorming/SKILL.md"),
  "writing-plans": path.join(HOME, ".agents/skills/writing-plans/SKILL.md"),
  "systematic-debugging": path.join(HOME, ".agents/skills/systematic-debugging/SKILL.md"),
  "test-driven-development": path.join(HOME, ".agents/skills/test-driven-development/SKILL.md"),
  "verification-before-completion": path.join(
    HOME,
    ".agents/skills/verification-before-completion/SKILL.md",
  ),
  "web-design-guidelines": path.join(HOME, ".agents/skills/web-design-guidelines/SKILL.md"),
  "deploy-to-vercel": path.join(HOME, ".agents/skills/deploy-to-vercel/SKILL.md"),
  "vercel-cli": path.join(HOME, ".agents/skills/vercel-cli-with-tokens/SKILL.md"),
  "vercel-optimize": path.join(HOME, ".agents/skills/vercel-optimize/SKILL.md"),
  "finishing-branch": path.join(HOME, ".agents/skills/finishing-a-development-branch/SKILL.md"),
  "using-git-worktrees": path.join(HOME, ".agents/skills/using-git-worktrees/SKILL.md"),
  nextjs: path.join(VERCEL_SKILLS, "nextjs/SKILL.md"),
  "react-best-practices": path.join(VERCEL_SKILLS, "react-best-practices/SKILL.md"),
  shadcn: path.join(VERCEL_SKILLS, "shadcn/SKILL.md"),
  "ai-sdk": path.join(VERCEL_SKILLS, "ai-sdk/SKILL.md"),
  "ai-gateway": path.join(VERCEL_SKILLS, "ai-gateway/SKILL.md"),
  "vercel-firewall": path.join(VERCEL_SKILLS, "vercel-firewall/SKILL.md"),
  "auth-clerk": path.join(VERCEL_SKILLS, "auth/SKILL.md"),
  context7: path.join(HOME, ".claude/skills/context7-mcp/SKILL.md"),
  xlsx: path.join(HOME, ".grok/skills/xlsx/SKILL.md"),
  docx: path.join(HOME, ".grok/skills/docx/SKILL.md"),
  pptx: path.join(HOME, ".grok/skills/pptx/SKILL.md"),
  imagine: path.join(HOME, ".grok/skills/imagine/SKILL.md"),
  "create-skill": path.join(HOME, ".grok/skills/create-skill/SKILL.md"),
  "help-grok": path.join(HOME, ".grok/skills/help/SKILL.md"),
  "check-work": path.join(HOME, ".grok/skills/check-work/SKILL.md"),
  implement: path.join(HOME, ".grok/bundled/skills/implement/SKILL.md"),
  review: path.join(HOME, ".grok/bundled/skills/review/SKILL.md"),
  design: path.join(HOME, ".grok/bundled/skills/design/SKILL.md"),
  "pr-babysit": path.join(HOME, ".grok/bundled/skills/pr-babysit/SKILL.md"),
  "design-system": path.join(ROOT, "skills/design-system/SKILL.md"),
  "extract-design": path.join(ROOT, "skills/extract-design/SKILL.md"),
};

fs.mkdirSync(OUT, { recursive: true });

const manifest = [];
const indexEntries = [];
let copied = 0;
let missing = 0;

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { name: "", description: "" };
  const lines = (m[1] ?? "").split(/\r?\n/);
  let name = "";
  let description = "";
  const stripQuotes = (s) =>
    (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")))
      ? s.slice(1, -1)
      : s;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) { name = nameMatch[1].trim(); continue; }
    const descMatch = line.match(/^description:\s*(.*)$/);
    if (descMatch) {
      let val = descMatch[1].trim();
      if (val === ">" || val === ">-" || val === "|" || val === "|-") {
        const folded = val.startsWith(">");
        const parts = [];
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s*$/.test(lines[j])) { parts.push(""); continue; }
          if (!/^[\s\t]/.test(lines[j])) break;
          parts.push(lines[j].replace(/^[\s\t]+/, ""));
        }
        description = folded
          ? parts.join(" ").replace(/\s+/g, " ").trim()
          : parts.join("\n").trim();
      } else {
        description = stripQuotes(val);
      }
    }
  }
  return { name, description };
}

const FORGE_NATIVE_SKILL_IDS = new Set([
  "design-system",
  "extract-design",
  "help-grok",
  "check-work",
  "implement",
  "review",
  "design",
  "pr-babysit",
  "create-skill",
]);

for (const [id, src] of Object.entries(SOURCES)) {
  if (!fs.existsSync(src)) {
    console.warn(`[skip] ${id}: não encontrado em ${src}`);
    missing++;
    continue;
  }
  const dest = path.join(OUT, `${id}.md`);
  fs.copyFileSync(src, dest);
  const stat = fs.statSync(dest);
  manifest.push({ id, bytes: stat.size });
  const fm = parseFrontmatter(fs.readFileSync(src, "utf8"));
  indexEntries.push({
    id,
    name: fm.name || id,
    description: fm.description,
    forgeNative: FORGE_NATIVE_SKILL_IDS.has(id),
  });
  copied++;
}

fs.writeFileSync(
  path.join(OUT, "manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), skills: manifest }, null, 2),
);

const ids = manifest.map((m) => m.id);
const tsOut = path.join(ROOT, "src/lib/forge-skills-bundled.ts");
fs.writeFileSync(
  tsOut,
  `/** Gerado por scripts/bundle-forge-skills.mjs — não editar */\nexport const BUNDLED_SKILL_IDS = new Set<string>([\n${ids.map((id) => `  ${JSON.stringify(id)},`).join("\n")}\n]);\nexport function isSkillBundled(id: string): boolean {\n  return BUNDLED_SKILL_IDS.has(id);\n}\n`,
);

/** Edge deploy: base64 evita que o CLI interprete regex de skills Next.js como paths. */
const edgeBundlesB64 = {};
for (const { id } of manifest) {
  let raw = fs.readFileSync(path.join(OUT, `${id}.md`), "utf8");
  if (raw.length > 12_000) raw = raw.slice(0, 12_000) + "\n\n…(truncado no bundle)";
  edgeBundlesB64[id] = Buffer.from(raw, "utf8").toString("base64");
}
const edgeOut = path.join(ROOT, "supabase/functions/_shared/forge-skill-bundles.generated.ts");
const b64Lines = Object.entries(edgeBundlesB64)
  .map(([id, b64]) => `  ${JSON.stringify(id)}: ${JSON.stringify(b64)},`)
  .join("\n");
fs.writeFileSync(
  edgeOut,
  `/** Gerado por scripts/bundle-forge-skills.mjs — não editar */\nexport const FORGE_SKILL_BUNDLES_B64: Record<string, string> = {\n${b64Lines}\n};\n`,
);

console.log(`Bundle: ${copied} skills → ${OUT} (${missing} ausentes)`);
console.log(`Manifest TS → ${tsOut}`);
console.log(`Edge bundles → ${edgeOut}`);

const indexOut = path.join(ROOT, "supabase/functions/_shared/forge-skills-index.generated.ts");
const indexLines = indexEntries
  .map(
    (e) =>
      `  { id: ${JSON.stringify(e.id)}, name: ${JSON.stringify(e.name)}, description: ${JSON.stringify(e.description)}, forgeNative: ${e.forgeNative} },`,
  )
  .join("\n");
fs.writeFileSync(
  indexOut,
  `/** Gerado por scripts/bundle-forge-skills.mjs — não editar */\nexport type ForgeSkillIndexEntry = { id: string; name: string; description: string; forgeNative: boolean };\nexport const FORGE_SKILLS_INDEX: ForgeSkillIndexEntry[] = [\n${indexLines}\n];\n`,
);
console.log(`Skills index → ${indexOut} (${indexEntries.length} entries, ${indexEntries.filter((e) => e.forgeNative).length} forge-native)`);
