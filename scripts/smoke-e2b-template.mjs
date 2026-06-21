#!/usr/bin/env node
/**
 * Smoke: valida estrutura do e2b-template/ sem fazer build real.
 * Verifica que template.ts, build.dev.ts, build.prod.ts, package.json estão OK.
 */

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(process.cwd(), "e2b-template");
let passed = 0;
let failed = 0;

function log(name, ok, detail = "") {
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}${detail ? " — " + detail : ""}`);
  if (ok) passed++;
  else failed++;
}

async function main() {
  console.log("=== E2B Template — Smoke ===\n");

  // 1. Files exist
  const required = ["template.ts", "build.dev.ts", "build.prod.ts", "package.json", "tsconfig.json"];
  for (const f of required) {
    try {
      const content = readFileSync(join(ROOT, f), "utf8");
      log(`file ${f}`, content.length > 0, `${content.length} bytes`);
    } catch (e) {
      log(`file ${f}`, false, e.message);
    }
  }

  // 2. template.ts uses required E2B SDK methods
  const template = readFileSync(join(ROOT, "template.ts"), "utf8");
  log("template uses Template()", template.includes("Template()"));
  log("template sets start command", /setStartCmd|set_start_cmd/.test(template));
  log("template waits for port 9222", /9222|CHROMIUM_DEVTOOLS_PORT/.test(template));
  log("template installs chromium", /chromium/i.test(template));
  log("template installs playwright", /playwright/i.test(template));

  // 3. package.json has e2b dep
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  log("e2b dep present", !!pkg.devDependencies?.e2b);
  log("build:dev script", !!pkg.scripts?.["build:dev"]);
  log("build:prod script", !!pkg.scripts?.["build:prod"]);

  // 4. Run executor (default template)
  const executor = readFileSync(resolve(process.cwd(), "src/inngest/executor/run-design-dna.ts"), "utf8");
  log("executor uses custom template by default", /dreaming-doing-chromium/.test(executor));
  log("executor skips runtime playwright install (uses template)", !executor.includes("npm install playwright"));
  log("executor pings CDP after sandbox", /json\/version/.test(executor));

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
