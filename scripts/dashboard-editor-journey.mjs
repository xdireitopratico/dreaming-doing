#!/usr/bin/env node
/**
 * Browser E2E — Fase S checklist §4.
 *
 * Fases (E2E_PHASES ou --phases=):
 *   dashboard       — prompt → editor, user bubble, Pensando
 *   inspector-live  — timeline do inspector cresce durante run (tool_start/done)
 *   f5              — F5 mid-run, UI recupera (working ou running)
 *   plan-dock       — plan mode: dock com Review após awaiting_user
 *   second-turn     — 2ª mensagem, mesma jornada (Pensando de novo)
 *
 * Uso:
 *   npm run dev
 *   E2E_EMAIL=... E2E_PASSWORD=... npm run check:dashboard-journey
 *
 * Opcional:
 *   E2E_STORAGE_STATE=.e2e/auth.json
 *   E2E_CLEANUP=0
 *   E2E_REQUIRED=1
 *   E2E_PHASES=dashboard,f5,second-turn
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
const RUN_ACTIVE_TIMEOUT_MS = Number(process.env.E2E_RUN_ACTIVE_TIMEOUT_MS ?? "90000");
const RUN_IDLE_TIMEOUT_MS = Number(process.env.E2E_RUN_IDLE_TIMEOUT_MS ?? "300000");
const F5_RECOVER_TIMEOUT_MS = Number(process.env.E2E_F5_RECOVER_TIMEOUT_MS ?? "20000");
const INSPECTOR_LIVE_TIMEOUT_MS = Number(process.env.E2E_INSPECTOR_LIVE_TIMEOUT_MS ?? "120000");
const CLEANUP = process.env.E2E_CLEANUP !== "0";
const REQUIRED = process.env.E2E_REQUIRED === "1";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const PHASES = new Set(
  (process.env.E2E_PHASES ?? arg("phases", "dashboard,inspector-live,f5,second-turn"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const OUT_DIR = resolve(__dirname, "../.e2e-screenshots");
const TERMINAL_RUN = new Set(["completed", "failed", "canceled", "awaiting_user"]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function fetchConversationId(projectId) {
  const res = await rest(`conversations?project_id=eq.${projectId}&select=id&order=created_at.desc&limit=1`);
  const rows = await res.json();
  return rows?.[0]?.id ?? null;
}

async function fetchLatestRun(conversationId) {
  const res = await rest(
    `agent_runs?conversation_id=eq.${conversationId}&select=id,status,finished_at&order=created_at.desc&limit=1`,
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function fetchStreamEvents(runId) {
  const res = await rest(
    `agent_stream_events?run_id=eq.${runId}&select=seq,event_type,payload&order=seq.asc`,
  );
  return (await res.json()) ?? [];
}

function streamHasToolActivity(events) {
  return events.some((e) => {
    if (e.event_type === "tool_start" || e.event_type === "tool_call" || e.event_type === "tool_done") {
      return true;
    }
    if (e.event_type === "explore" || e.event_type === "phase") return true;
    return false;
  });
}

async function pollRunStatus(conversationId, predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await fetchLatestRun(conversationId);
    if (run && predicate(run)) return run;
    await sleep(2000);
  }
  throw new Error(`timeout aguardando run ${label} (${timeoutMs}ms)`);
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

  if (!E2E_EMAIL || !E2E_PASSWORD) return null;
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

async function waitForWorkingLine(page, timeoutMs, failures, label) {
  const working = page.locator("[data-testid=chat-working-line]");
  try {
    await working.waitFor({ state: "visible", timeout: timeoutMs });
    const text = (await working.innerText()).trim();
    if (!/Pensando|Pensou/i.test(text)) {
      failures.push(`${label}: working line inesperada — "${text}"`);
      return false;
    }
    return true;
  } catch {
    failures.push(`${label}: «Pensando…» não apareceu em ${timeoutMs}ms`);
    return false;
  }
}

async function waitForHeaderState(page, state, timeoutMs) {
  const el = page.locator(`[data-testid=forge-header-state][data-state="${state}"]`);
  await el.waitFor({ state: "visible", timeout: timeoutMs });
}

async function sendComposerMessage(page, text) {
  const input = page.locator("[data-testid=chat-composer] .forge-composer-input");
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await input.fill(text);
  await page.locator("[data-testid=chat-composer] .forge-composer-send").click();
}

async function openInspectorFromCard(page, opts = {}) {
  const waitMs = opts.waitForCardMs ?? 60_000;
  const card = page.locator("[data-testid=chat-job-card] .forge-mini-card-body").first();
  try {
    await card.waitFor({ state: "visible", timeout: waitMs });
  } catch {
    return false;
  }
  await card.click();
  await page.locator("[data-testid=job-inspector]").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator('[role=tab][data-active="true"]').first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  return true;
}

async function phaseDashboard(page, failures, prompt) {
  console.log("→ fase dashboard");
  await page.goto(`${BASE}/projects`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  if (page.url().includes("/auth")) {
    failures.push("dashboard: redirecionou para /auth — sessão inválida");
    return null;
  }

  const textarea = page.locator(".dashboard-prompt-wrap textarea");
  await textarea.waitFor({ state: "visible", timeout: 15_000 });
  await textarea.fill(prompt);
  await page.locator(".dashboard-prompt-wrap button[type=submit]").click();

  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/i, { timeout: NAV_TIMEOUT_MS });
  const projectId = page.url().match(/\/projects\/([0-9a-f-]{36})/i)?.[1] ?? null;

  const userBubble = page.locator("[data-testid=chat-message-user]").first();
  await userBubble.waitFor({ state: "visible", timeout: 15_000 });
  const userText = (await userBubble.innerText()).trim();
  if (!userText.includes("[e2e-journey]")) {
    failures.push(`dashboard: mensagem do usuário inesperada — ${userText.slice(0, 80)}…`);
  }

  await waitForWorkingLine(page, THINKING_TIMEOUT_MS, failures, "dashboard");
  await page.locator("[data-testid=chat-composer]").waitFor({ state: "visible", timeout: 10_000 });
  await page.screenshot({ path: resolve(OUT_DIR, "phase-dashboard.png"), fullPage: true });

  return projectId;
}

async function phaseInspectorLive(page, conversationId, failures) {
  console.log("→ fase inspector-live");
  if (!SERVICE_KEY || !conversationId) {
    failures.push("inspector-live: SUPABASE_SERVICE_ROLE_KEY ou conversationId ausente");
    return;
  }

  let run;
  try {
    run = await pollRunStatus(conversationId, (r) => r.status === "running", RUN_ACTIVE_TIMEOUT_MS, "running");
  } catch (e) {
    failures.push(`inspector-live: ${e instanceof Error ? e.message : e}`);
    return;
  }

  const opened = await openInspectorFromCard(page);
  if (!opened) {
    failures.push("inspector-live: mini-card não apareceu — não abriu inspector");
    return;
  }

  let lastEntryCount = 0;
  let entryGrew = false;
  let sawToolInDom = false;
  let sawStreamActivity = false;
  let succeeded = false;

  const deadline = Date.now() + INSPECTOR_LIVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const entries = await page.locator("[data-testid=inspector-timeline-track] [data-kind]").count();
    if (entries > lastEntryCount) {
      entryGrew = true;
      lastEntryCount = entries;
    }

    if ((await page.locator("[data-testid=timeline-tool]").count()) > 0) {
      sawToolInDom = true;
    }

    const events = await fetchStreamEvents(run.id);
    if (streamHasToolActivity(events)) sawStreamActivity = true;

    if (entryGrew && (sawToolInDom || sawStreamActivity)) {
      succeeded = true;
      break;
    }
    await sleep(1500);
  }

  if (!succeeded) {
    if (!entryGrew) failures.push("inspector-live: timeline não cresceu durante a run");
    if (!sawToolInDom && !sawStreamActivity) {
      failures.push("inspector-live: sem tool/fase no DOM nem no stream");
    }
  }

  const finalEvents = await fetchStreamEvents(run.id);
  const hadToolStart = eventsHadToolStart(finalEvents);
  const hadToolDone = finalEvents.some((e) => e.event_type === "tool_done");
  if (hadToolStart && hadToolDone && !sawToolInDom) {
    failures.push("inspector-live: tool_done no stream mas tool ausente no inspector");
  }

  await page.screenshot({ path: resolve(OUT_DIR, "phase-inspector-live.png"), fullPage: true });
}

function eventsHadToolStart(events) {
  return events.some((e) => e.event_type === "tool_start" || e.event_type === "tool_call");
}

async function phasePlanDock(page, conversationId, failures) {
  console.log("→ fase plan-dock");
  if (!SERVICE_KEY || !conversationId) {
    failures.push("plan-dock: SUPABASE_SERVICE_ROLE_KEY ou conversationId ausente");
    return;
  }

  try {
    await pollRunStatus(
      conversationId,
      (r) => r.status === "awaiting_user",
      RUN_IDLE_TIMEOUT_MS,
      "awaiting_user",
    );
  } catch (e) {
    failures.push(`plan-dock: ${e instanceof Error ? e.message : e}`);
    return;
  }

  const dock = page.locator("[data-testid=chat-plan-dock-ready]");
  try {
    await dock.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    failures.push("plan-dock: chat-plan-dock-ready não visível");
    return;
  }

  if ((await page.getByRole("button", { name: "Review" }).count()) < 1) {
    failures.push("plan-dock: botão Review ausente");
  }

  await page.screenshot({ path: resolve(OUT_DIR, "phase-plan-dock.png"), fullPage: true });
}

async function phaseF5(page, conversationId, failures) {
  console.log("→ fase f5 (mid-run)");
  if (!SERVICE_KEY || !conversationId) {
    failures.push("f5: SUPABASE_SERVICE_ROLE_KEY ou conversationId ausente — não dá para poll run");
    return;
  }

  try {
    await pollRunStatus(conversationId, (r) => r.status === "running", RUN_ACTIVE_TIMEOUT_MS, "running");
  } catch (e) {
    failures.push(`f5: ${e instanceof Error ? e.message : e}`);
    return;
  }

  await openInspectorFromCard(page);
  const trackBefore = await page.locator("[data-testid=inspector-timeline-track]").count();

  await page.reload({ waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  const deadline = Date.now() + F5_RECOVER_TIMEOUT_MS;
  let recovered = false;
  while (Date.now() < deadline) {
    const runningHeader = await page
      .locator('[data-testid=forge-header-state][data-state="running"]')
      .count();
    const working = await page.locator("[data-testid=chat-working-line]").count();
    const userOk = await page.locator("[data-testid=chat-message-user]").count();
    const trackAfter = await page.locator("[data-testid=inspector-timeline-track]").count();

    if (userOk > 0 && (runningHeader > 0 || working > 0 || trackAfter >= trackBefore)) {
      recovered = true;
      break;
    }
    await sleep(500);
  }

  if (!recovered) {
    failures.push(`f5: UI não recuperou em ${F5_RECOVER_TIMEOUT_MS}ms após reload`);
  }

  await page.screenshot({ path: resolve(OUT_DIR, "phase-f5.png"), fullPage: true });
}

async function phaseSecondTurn(page, conversationId, failures) {
  console.log("→ fase second-turn");
  if (SERVICE_KEY && conversationId) {
    try {
      await pollRunStatus(
        conversationId,
        (r) => TERMINAL_RUN.has(r.status),
        RUN_IDLE_TIMEOUT_MS,
        "terminal",
      );
    } catch (e) {
      failures.push(`second-turn: ${e instanceof Error ? e.message : e}`);
      return;
    }
  } else {
    try {
      await waitForHeaderState(page, "idle", 30_000);
    } catch {
      /* composer pode estar liberado com plan-pending */
    }
  }

  const secondPrompt = `[e2e-journey-2] ok (${Date.now()})`;
  const userCountBefore = await page.locator("[data-testid=chat-message-user]").count();
  await sendComposerMessage(page, secondPrompt);

  await page
    .locator("[data-testid=chat-message-user]")
    .nth(userCountBefore)
    .waitFor({ state: "visible", timeout: 15_000 });

  const secondText = await page.locator("[data-testid=chat-message-user]").nth(userCountBefore).innerText();
  if (!secondText.includes("[e2e-journey-2]")) {
    failures.push("second-turn: 2ª mensagem do usuário não apareceu");
  }

  await waitForWorkingLine(page, THINKING_TIMEOUT_MS, failures, "second-turn");
  await page.screenshot({ path: resolve(OUT_DIR, "phase-second-turn.png"), fullPage: true });
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

  const defaultPrompt = PHASES.has("inspector-live")
    ? `[e2e-journey] Use web_search sobre Vite 7 e responda em 2 bullets — sem editar arquivos (${Date.now()})`
    : PHASES.has("plan-dock")
      ? `[e2e-journey] Proponha um plano curto para adicionar um botão de contador no app — sem editar ainda (${Date.now()})`
      : `[e2e-journey] Responda apenas "ok" — sem editar arquivos (${Date.now()})`;
  const prompt = arg("prompt", defaultPrompt);

  console.log("Fases:", [...PHASES].join(", "));

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
  let conversationId = null;
  const failures = [];

  try {
    if (PHASES.has("dashboard")) {
      projectId = await phaseDashboard(page, failures, prompt);
      if (projectId) conversationId = await fetchConversationId(projectId);
    } else if (arg("project-id", "")) {
      projectId = arg("project-id", "");
      await page.goto(`${BASE}/projects/${projectId}`, { waitUntil: "domcontentloaded" });
      conversationId = await fetchConversationId(projectId);
    }

    if (PHASES.has("inspector-live") && !failures.length) {
      await phaseInspectorLive(page, conversationId, failures);
    }

    if (PHASES.has("f5") && !failures.length) {
      await phaseF5(page, conversationId, failures);
      if (conversationId) {
        conversationId = (await fetchConversationId(projectId)) ?? conversationId;
      }
    }

    if (PHASES.has("plan-dock") && !failures.length) {
      await phasePlanDock(page, conversationId, failures);
    }

    if (PHASES.has("second-turn") && !failures.length) {
      await phaseSecondTurn(page, conversationId, failures);
    }
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e));
    await page.screenshot({ path: resolve(OUT_DIR, "journey-fail.png"), fullPage: true }).catch(() => {});
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

  console.log(`PASS: fases [${[...PHASES].join(", ")}]`);
  console.log(`Screenshots: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});