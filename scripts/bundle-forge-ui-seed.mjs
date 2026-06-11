#!/usr/bin/env node
/**
 * Embute packages/forge-ui no seed vite-react (sandbox E2B não tem monorepo).
 * Rode: node scripts/bundle-forge-ui-seed.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FORGE_UI = path.join(ROOT, "packages/forge-ui");
const OUT = path.join(ROOT, "src/lib/seeds/forge-ui-bundle.generated.ts");

const SKIP = new Set(["node_modules", "dist", ".git"]);

function walk(dir, base = "") {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      entries.push(...walk(full, rel));
    } else if (/\.(ts|tsx|json)$/.test(name)) {
      entries.push({ rel: `packages/forge-ui/${rel}`, full });
    }
  }
  return entries;
}

const files = walk(FORGE_UI);
const lines = [
  "// AUTO-GENERATED — node scripts/bundle-forge-ui-seed.mjs",
  'import type { SeedFile } from "./types";',
  "",
  "export const FORGE_UI_SEED_FILES: SeedFile[] = [",
];

for (const { rel, full } of files.sort((a, b) => a.rel.localeCompare(b.rel))) {
  const content = fs.readFileSync(full, "utf8");
  const escaped = JSON.stringify(content);
  lines.push(`  { path: ${JSON.stringify(rel)}, content: ${escaped} },`);
}

lines.push("];", "");

fs.writeFileSync(OUT, lines.join("\n"));
console.log(`[forge-ui-seed] ${files.length} arquivos → ${OUT}`);
