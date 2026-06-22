#!/usr/bin/env node
/**
 * Gera Playwright storage state para E2E browser (dashboard journey).
 *
 * Uso:
 *   npm run setup:e2e-auth
 *   E2E_STORAGE_STATE=.e2e/auth.json npm run check:dashboard-journey
 *
 * Sem E2E_EMAIL: provisiona usuário via SUPABASE_SERVICE_ROLE_KEY (.e2e/credentials.json)
 */
import { writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/load-env-local.mjs";
import { buildSupabaseAuthStorage } from "./lib/supabase-auth-storage.mjs";
import { resolveE2eCredentials } from "./lib/e2e-credentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvLocal();

const BASE = process.env.DEV_URL ?? "http://127.0.0.1:8080";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const OUT = process.env.E2E_STORAGE_STATE ?? resolve(__dirname, "../.e2e/auth.json");

async function main() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error("FAIL: SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY necessários");
    process.exit(1);
  }

  const creds = await resolveE2eCredentials({
    supabaseUrl: SUPABASE_URL,
    serviceKey: SERVICE_KEY,
    anonKey: ANON_KEY,
  });
  if (!creds) {
    console.error("FAIL: defina E2E_EMAIL/E2E_PASSWORD ou SUPABASE_SERVICE_ROLE_KEY para provisionar");
    process.exit(1);
  }

  const auth = await buildSupabaseAuthStorage({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    email: creds.email,
    password: creds.password,
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
  console.log("source:", creds.source, "| userId:", auth.userId);
  console.log("");
  console.log("Próximo passo:");
  console.log(`  E2E_STORAGE_STATE=${OUT} npm run check:dashboard-journey`);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});