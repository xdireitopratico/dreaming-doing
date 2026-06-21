#!/usr/bin/env node
/**
 * Smoke: verifica que os 3 patches (shell_exec output, shellOutput fallback,
 * tool_done event output) estão aplicados e funcionando.
 *
 * Estratégia: checa estática + Deno test para o shell_exec.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(process.cwd());

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? " — " + detail : ""}`);
  if (ok) pass++;
  else fail++;
}

console.log("=== Smoke: 3 patches do build failure diagnosis ===\n");

// Patch 1: shell_exec retorna stderr no output (não null)
const shell = read("supabase/functions/agent-run/tools/shell.ts");
check(
  "Patch 1: shell_exec retorna output com stderr no catch",
  shell.includes('stderr: `Sandbox: ${msg}`') &&
    shell.includes("output: { exitCode: -1"),
  "verifica catch com output estruturado",
);

// Patch 2: shellOutput usa result.error como fallback
const observer = read("supabase/functions/agent-run/observer.ts");
check(
  "Patch 2: shellOutput usa result.error como fallback",
  observer.includes("return result.error ?? \"\""),
  "verifica fallback em shellOutput",
);

// Patch 3: tool_done event inclui output
const loop = read("supabase/functions/agent-run/loop.ts");
const toolDoneBuildHasOutput =
  /this\.emit\("tool_done"[^}]*output:\s*\n?\s*typeof result\.output/m.test(loop);
check(
  "Patch 3: tool_done event inclui output no Build mode",
  toolDoneBuildHasOutput,
  "verifica que output chega no agent_stream_events",
);

// Bonus: garantir que o Deno test do loop passa
console.log("\nRodando Deno test do loop (43 testes)…");
try {
  const out = execSync(
    "npx deno test --allow-all --no-check supabase/functions/agent-run/loop.test.ts 2>&1 | tail -3",
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const ok = /43 passed/.test(out) || /\d+ passed \| 0 failed/.test(out);
  check("Deno loop tests passam (sem regressão)", ok, out.trim().split("\n").pop());
} catch (e) {
  check("Deno loop tests passam (sem regressão)", false, e.message.slice(0, 100));
}

console.log(`\n=== Result: ${pass} passed, ${fail} failed ===\n`);
process.exit(fail > 0 ? 1 : 0);
