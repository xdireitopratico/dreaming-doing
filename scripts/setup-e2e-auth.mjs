#!/usr/bin/env node
/**
 * Gera Playwright storage state para E2E browser (dashboard journey).
 *
 * Uso:
 *   E2E_EMAIL=... E2E_PASSWORD=... node scripts/setup-e2e-auth.mjs
 *   E2E_STORAGE_STATE=.e2e/auth.json npm run check:dashboard-journey
 */
import { mkdir, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/load-env-local.mjs";
import { buildSupabaseAuthStorage } from "./lib/supabase-auth-storage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvLocal();

const BASE = process.env.DEV_URL ?? "http://127.0.0.1:8080";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
const OUT = process.env.E2E_STORAGE_STATE ?? resolve(__dirname, "../.e2e/auth.json");

async function main() {
  if (!E2E_EMAIL || !E2E_PASSWORD) {
    console.error("FAIL: defina E2E_EMAIL e E2E_PASSWORD");
    process.exit(1);
  }
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("FAIL: SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY necessários");
    process.exit(1);
  }

  const auth = await buildSupabaseAuthStorage({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  });

  const state = {
    cookies: [],
    origins: [
      {
        origin: BASE.replace(/\/$/, ""),
        localStorage: [{ name: auth.storageKey, value: auth.sessionJson }],
      },
    ],
  };

  await mkdir(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  console.log("OK: storage state gravado em", OUT);
  console.log("userId:", auth.userId);
  console.log("");
  console.log("Próximo passo:");
  console.log(`  E2E_STORAGE_STATE=${OUT} npm run check:dashboard-journey`);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});