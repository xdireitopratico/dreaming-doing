#!/usr/bin/env node
/**
 * Guardrail: forbidden legacy terminal error must not appear in production TS.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const FORBIDDEN = "O modelo não respondeu com a mensagem esperada";
const SCAN_DIRS = [
  "supabase/functions/agent-run",
  "supabase/functions/_shared",
  "src/inngest",
  "src/lib",
];

const SKIP_PARTS = new Set(["node_modules", "dist", ".git"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_PARTS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(ts|tsx|mjs|js)$/.test(name)) continue;
    if (/\.test\.(ts|tsx)$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

const violations = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  try {
    for (const file of walk(abs)) {
      const lines = readFileSync(file, "utf8").split("\n");
      const hit = lines.some((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
        return line.includes(FORBIDDEN);
      });
      if (hit) {
        violations.push(relative(ROOT, file));
      }
    }
  } catch {
    // dir may not exist in all checkouts
  }
}

if (violations.length > 0) {
  console.error("FAIL: forbidden terminal error string found in:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("OK: agent-run contract check passed (no forbidden terminal error in production sources)");