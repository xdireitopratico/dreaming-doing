#!/usr/bin/env node
/**
 * Browser E2E — Fase S checklist §4 (dashboard → editor).
 *
 * Prova:
 *  1. Prompt no dashboard cria projeto e navega ao editor
 *  2. Mensagem do usuário aparece sem re-envio
 *  3. «Pensando…» visível em < thinkingTimeoutMs (default 8s — rede + createProject)
 *
 * Uso:
 *   npm run dev
 *   E2E_EMAIL=... E2E_PASSWORD=... node scripts/dashboard-editor-journey.mjs
 *   node scripts/dashboard-editor-journey.mjs http://127.0.0.1:8080
 *
 * Opcional: E2E_STORAGE_STATE=.e2e/auth.json (pula login)
 *           E2E_CLEANUP=0 (não apaga projeto criado)
 *           E2E_REQUIRED=1 (exit 1 se credenciais ausentes)
 */
import { chromium } from "playwright";
import { mkdir, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/load-env-local.mjs";
import { buildSupabaseAuthStorage } from "./lib/supabase-auth-storage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvLocal();

const BASE = process.argv.find((a) => a.startsWith("http")) ?? process.env.DEV_URL ?? "http://127.0.0.1:8080";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
const STORAGE_STATE_PATH = process.env.E2E_STORAGE_STATE ?? "";
const THINKING_TIMEOUT_MS = Number(process.env.E2E_THINKING_TIMEOUT_MS ?? "8000");
const NAV_TIMEOUT_MS = Number(process.env.E2E_NAV_TIMEOUT_MS ?? "90000");
const CLEANUP = process.env.E2E_CLEANUP !== "0";
const REQUIRED = process.env.E2E_REQUIRED === "1";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const OUT_DIR = resolve(__dirname, "../.e2e-screenshots");

async function rest(path, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function deleteProject(projectId) {
  if (!SERVICE_KEY || !projectId) return;
  await rest(`projects?id=eq.${projectId}`, { method: "DELETE" });
}

async function ensureAuthContext(browser) {
  if (STORAGE_STATE_PATH) {
    try {
      readFileSync(STORAGE_STATE_PATH, "utf8");
      return browser.newContext({ storageState: STORAGE_STATE_PATH });
    } catch {
      console.warn(`WARN: E2E_STORAGE_STATE inválido (${STORAGE_STATE_PATH}) — tentando login`);
    }
  }

  if (!E2E_EMAIL || !E2E_PASSWORD) {
    return null;
  }
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error("SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY necessários para login E2E");
  }

  const auth = await buildSupabaseAuthStorage({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
  });

  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, json }) => {
      localStorage.setItem(key, json);
    },
    { key: auth.storageKey, json: auth.sessionJson },
  );

  if (STORAGE_STATE_PATH) {
    try {
      await mkdir(dirname(resolve(STORAGE_STATE_PATH)), { recursive: true });
      await context.storageState({ path: STORAGE_STATE_PATH });
    } catch {
      /* best-effort cache */
    }
  }

  return context;
}

async function main() {
  const hasAuth = STORAGE_STATE_PATH || (E2E_EMAIL && E2E_PASSWORD);
  if (!hasAuth) {
    const msg =
      "SKIP: defina E2E_EMAIL + E2E_PASSWORD (ou E2E_STORAGE_STATE) para rodar o journey browser";
    if (REQUIRED) {
      console.error(`FAIL: ${msg}`);
      process.exit(1);
    }
    console.log(msg);
    process.exit(0);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const prompt = arg(
    "prompt",
    `[e2e-journey] Responda apenas "ok" — sem editar arquivos (${Date.now()})`,
  );

  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await ensureAuthContext(browser);
    if (!context) throw new Error("contexto de auth não criado");
  } catch (e) {
    await browser.close();
    console.error("FAIL: auth —", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const page = await context.newPage({ viewport: { width: 1280, height: 900 } });
  let projectId = null;
  const failures = [];

  try {
    await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

    if (page.url().includes("/auth")) {
      failures.push("redirecionou para /auth — sessão inválida");
    } else {
      const textarea = page.locator(".dashboard-prompt-wrap textarea");
      await textarea.waitFor({ state: "visible", timeout: 15_000 });
      await textarea.fill(prompt);
      await page.locator(".dashboard-prompt-wrap button[type=submit]").click();

      await page.waitForURL(/\/projects\/[0-9a-f-]{36}/i, { timeout: NAV_TIMEOUT_MS });
      projectId = page.url().match(/\/projects\/([0-9a-f-]{36})/i)?.[1] ?? null;

      const userBubble = page.locator("[data-testid=chat-message-user]").first();
      await userBubble.waitFor({ state: "visible", timeout: 15_000 });
      const userText = (await userBubble.innerText()).trim();
      if (!userText.includes("[e2e-journey]")) {
        failures.push(`mensagem do usuário não veio do dashboard (got: ${userText.slice(0, 80)}…)`);
      }

      const working = page.locator("[data-testid=chat-working-line]");
      try {
        await working.waitFor({ state: "visible", timeout: THINKING_TIMEOUT_MS });
        const label = (await working.innerText()).trim();
        if (!/Pensando|Pensou/i.test(label)) {
          failures.push(`working line inesperada: "${label}"`);
        }
      } catch {
        failures.push(`«Pensando…» não apareceu em ${THINKING_TIMEOUT_MS}ms`);
      }

      const composer = page.locator("[data-testid=chat-composer]");
      await composer.waitFor({ state: "visible", timeout: 10_000 });

      await page.screenshot({ path: resolve(OUT_DIR, "dashboard-editor-journey.png"), fullPage: true });
    }
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e));
    await page.screenshot({ path: resolve(OUT_DIR, "dashboard-editor-journey-fail.png"), fullPage: true }).catch(() => {});
  } finally {
    if (CLEANUP && projectId) {
      await deleteProject(projectId);
      console.log(`Cleanup: projeto ${projectId.slice(0, 8)} removido`);
    }
    await context.close();
    await browser.close();
  }

  if (failures.length) {
    console.error("\nFALHAS:");
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`Screenshots: ${OUT_DIR}`);
    process.exit(1);
  }

  console.log("PASS: dashboard → editor — user message + Pensando visível");
  console.log(`Screenshot: ${resolve(OUT_DIR, "dashboard-editor-journey.png")}`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});