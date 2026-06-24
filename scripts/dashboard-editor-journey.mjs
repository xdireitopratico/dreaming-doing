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
 * Auth cache: npm run setup:e2e-auth  →  E2E_STORAGE_STATE=.e2e/auth.json
 *
 * Opcional:
 *   E2E_CLEANUP=0
 *   E2E_REQUIRED=1
 *   E2E_PHASES=dashboard,inspector-live,f5,second-turn
 *   OPENROUTER_API_KEY=sk-or-...   # recomendado (modelo free, sem rate limit Groq)
 *   E2E_MODEL=nex-agi/nex-n2-pro:free
 *   E2E_PLAN_DOCK_REQUIRED=1        # falha se plan-dock pedido sem chave LLM
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./lib/load-env-local.mjs";
import { buildSupabaseAuthStorage } from "./lib/supabase-auth-storage.mjs";
import { resolveE2eCredentials } from "./lib/e2e-credentials.mjs";
import { hasDedicatedE2eLlmKey, seedE2eAgentSetup } from "./lib/e2e-agent-setup.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvLocal();

const BASE =
  process.argv.find((a) => a.startsWith("http")) ?? process.env.DEV_URL ?? "http://127.0.0.1:8080";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
const DEFAULT_STORAGE = resolve(__dirname, "../.e2e/auth.json");
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

const PHASES_RAW = new Set(
  (process.env.E2E_PHASES ?? arg("phases", "dashboard,inspector-live,f5,second-turn"))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const PHASES = new Set(PHASES_RAW);

if (
  PHASES_RAW.has("plan-dock") &&
  process.env.E2E_PLAN_DOCK_REQUIRED === "1" &&
  !hasDedicatedE2eLlmKey()
) {
  console.log(
    "WARN: OPENROUTER_API_KEY ausente — o journey E2E só roda com chave OpenRouter dedicada no ambiente deste projeto.",
  );
}

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
  const res = await rest(
    `conversations?project_id=eq.${projectId}&select=id&order=created_at.desc&limit=1`,
  );
  const rows = await res.json();
  return rows?.[0]?.id ?? null;
}

async function fetchLatestRun(conversationId) {
  const res = await rest(
    `agent_runs?conversation_id=eq.${conversationId}&select=id,status,error,finished_at,meta&order=started_at.desc&limit=1`,
  );
  const rows = await res.json();
  if (!res.ok) {
    throw new Error(`fetchLatestRun: ${res.status} ${JSON.stringify(rows).slice(0, 200)}`);
  }
  return rows?.[0] ?? null;
}

async function fetchRunById(runId) {
  const res = await rest(
    `agent_runs?id=eq.${runId}&select=id,status,error,finished_at,meta&limit=1`,
  );
  const rows = await res.json();
  if (!res.ok) {
    throw new Error(`fetchRunById: ${res.status} ${JSON.stringify(rows).slice(0, 200)}`);
  }
  return rows?.[0] ?? null;
}

function isRunAwaitingPlan(run) {
  if (!run) return false;
  const meta = run.meta && typeof run.meta === "object" ? run.meta : {};
  const awaiting = meta.awaitingUser;
  if (awaiting && typeof awaiting === "object" && awaiting.type === "plan_approval") return true;
  return run.status === "awaiting_user";
}

function isRateLimitError(error) {
  const msg = typeof error === "string" ? error : "";
  return /limite por minuto|rate.?limit/i.test(msg);
}

async function fetchStreamEvents(runId) {
  const res = await rest(
    `agent_stream_events?run_id=eq.${runId}&select=seq,event_type,payload&order=seq.asc`,
  );
  return (await res.json()) ?? [];
}

function streamHasToolActivity(events) {
  return events.some((e) => {
    if (
      e.event_type === "tool_start" ||
      e.event_type === "tool_call" ||
      e.event_type === "tool_done"
    ) {
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

function resolveStoragePath() {
  if (STORAGE_STATE_PATH) return STORAGE_STATE_PATH;
  try {
    readFileSync(DEFAULT_STORAGE, "utf8");
    return DEFAULT_STORAGE;
  } catch {
    return null;
  }
}

async function ensureAuthContext(browser) {
  const storagePath = resolveStoragePath();
  if (storagePath) {
    try {
      readFileSync(storagePath, "utf8");
      return await browser.newContext({ storageState: storagePath });
    } catch {
      console.warn(`WARN: storage state inválido (${storagePath}) — tentando login`);
    }
  }

  const email = process.env.E2E_EMAIL ?? E2E_EMAIL;
  const password = process.env.E2E_PASSWORD ?? E2E_PASSWORD;
  if (!email || !password) return null;
  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error("SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY necessários para login E2E");
  }

  const auth = await buildSupabaseAuthStorage({
    url: SUPABASE_URL,
    anonKey: ANON_KEY,
    email,
    password,
  });

  const context = await browser.newContext();
  await context.addInitScript(
    ({ key, json }) => {
      localStorage.setItem(key, json);
    },
    { key: auth.storageKey, json: auth.sessionJson },
  );

  const cachePath = STORAGE_STATE_PATH || DEFAULT_STORAGE;
  try {
    await mkdir(dirname(resolve(cachePath)), { recursive: true });
    await context.storageState({ path: cachePath });
  } catch {
    /* best-effort cache */
  }

  return context;
}

async function waitForWorkingLine(page, timeoutMs, failures, label) {
  const working = page.locator("[data-testid=chat-working-line], [data-testid=forge-thinking]");
  try {
    await working.first().waitFor({ state: "visible", timeout: timeoutMs });
    const text = (await working.first().innerText()).trim();
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

/** Aguarda coordinator + connect criarem run real (sem bootstrap Inngest). */
async function waitForNaturalAgentRun(page, conversationId, failures) {
  if (!SERVICE_KEY || !conversationId) {
    failures.push("agent-run: SUPABASE_SERVICE_ROLE_KEY ou conversationId ausente");
    return null;
  }
  console.log("→ aguardando run natural (coordinator + connect)");
  let run = null;
  try {
    run = await pollRunStatus(
      conversationId,
      (r) => r.status === "running" || r.status === "pending",
      RUN_ACTIVE_TIMEOUT_MS,
      "active",
    );
  } catch (e) {
    failures.push(`agent-run: ${e instanceof Error ? e.message : e}`);
    return null;
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const running = await page
      .locator('[data-testid=forge-header-state][data-state="running"]')
      .count();
    const card = await page.locator("[data-testid=chat-job-card]").count();
    const working =
      (await page.locator("[data-testid=chat-working-line]").count()) +
      (await page.locator("[data-testid=forge-thinking]").count());
    if (running > 0 || card > 0 || working > 0) return run.id;
    await sleep(500);
  }

  failures.push("agent-run: UI não anexou à run (sem header running, mini-card nem working line)");
  return run.id;
}

async function openInspectorFromCard(page, opts = {}) {
  const waitMs = opts.waitForCardMs ?? 120_000;
  const card = page.locator("[data-testid=chat-job-card] .forge-mini-card-body").first();
  try {
    await card.waitFor({ state: "visible", timeout: waitMs });
  } catch {
    return false;
  }
  await card.click();
  await page.locator("[data-testid=job-inspector]").waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator('[role=tab][data-active="true"]')
    .first()
    .waitFor({ state: "visible", timeout: 5000 })
    .catch(() => {});
  return true;
}

async function phaseDashboard(page, failures, prompt) {
  console.log("→ fase dashboard");
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });

  if (page.url().includes("/auth")) {
    failures.push("dashboard: redirecionou para /auth — sessão inválida");
    return null;
  }

  const textarea = page.locator(".dashboard-prompt-wrap textarea");
  await textarea.waitFor({ state: "visible", timeout: 15_000 });
  await textarea.fill(prompt);

  const serverFnDone = page
    .waitForResponse(
      (r) => r.ok() && r.url().includes("_serverFn") && r.request().method() === "POST",
      { timeout: NAV_TIMEOUT_MS },
    )
    .catch(() => null);

  await page.locator(".dashboard-prompt-wrap button[type=submit]").click();
  await serverFnDone;

  await page.waitForURL(/\/projects\/[0-9a-f-]{36}/i, {
    timeout: NAV_TIMEOUT_MS,
    waitUntil: "domcontentloaded",
  });
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

async function phaseInspectorLive(page, conversationId, failures, activeRunId = null) {
  console.log("→ fase inspector-live");
  if (!SERVICE_KEY || !conversationId) {
    failures.push("inspector-live: SUPABASE_SERVICE_ROLE_KEY ou conversationId ausente");
    return;
  }

  let run = activeRunId ? await fetchRunById(activeRunId) : null;
  if (!run) {
    try {
      run = await pollRunStatus(
        conversationId,
        (r) => r.status === "running",
        RUN_ACTIVE_TIMEOUT_MS,
        "running",
      );
    } catch (e) {
      failures.push(`inspector-live: ${e instanceof Error ? e.message : e}`);
      await page
        .screenshot({ path: resolve(OUT_DIR, "phase-inspector-live.png"), fullPage: true })
        .catch(() => {});
      return;
    }
  }
  if (run?.status === "failed") {
    failures.push(`inspector-live: run falhou — ${run.error ?? "sem erro"}`);
    await page
      .screenshot({ path: resolve(OUT_DIR, "phase-inspector-live.png"), fullPage: true })
      .catch(() => {});
    return;
  }

  const opened = await openInspectorFromCard(page);
  if (!opened) {
    failures.push("inspector-live: mini-card não apareceu — não abriu inspector");
    await page
      .screenshot({ path: resolve(OUT_DIR, "phase-inspector-live.png"), fullPage: true })
      .catch(() => {});
    return;
  }

  let lastEntryCount = 0;
  let entryGrew = false;
  let sawToolInDom = false;
  let sawStreamActivity = false;
  let succeeded = false;

  const deadline = Date.now() + INSPECTOR_LIVE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const live = await fetchRunById(run.id);
    if (live?.status === "failed") {
      failures.push(`inspector-live: run falhou — ${live.error ?? "sem erro"}`);
      await page
        .screenshot({ path: resolve(OUT_DIR, "phase-inspector-live.png"), fullPage: true })
        .catch(() => {});
      return;
    }

    const entries = await page
      .locator("[data-testid=inspector-timeline-track] [data-kind]")
      .count();
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

  const deadline = Date.now() + RUN_IDLE_TIMEOUT_MS;
  let planReady = false;
  while (Date.now() < deadline) {
    const run = await fetchLatestRun(conversationId);
    if (run?.status === "failed") {
      if (isRateLimitError(run.error)) {
        console.log("plan-dock: rate limit Groq — aguardando 65s antes de novo poll");
        await sleep(65_000);
        continue;
      }
      failures.push(`plan-dock: run falhou — ${run.error ?? "sem erro"}`);
      await page
        .screenshot({ path: resolve(OUT_DIR, "phase-plan-dock.png"), fullPage: true })
        .catch(() => {});
      return;
    }
    if (isRunAwaitingPlan(run)) {
      planReady = true;
      break;
    }
    await sleep(2000);
  }
  if (!planReady) {
    failures.push(`plan-dock: timeout aguardando plano (${RUN_IDLE_TIMEOUT_MS}ms)`);
    await page
      .screenshot({ path: resolve(OUT_DIR, "phase-plan-dock.png"), fullPage: true })
      .catch(() => {});
    return;
  }

  const dock = page.locator("[data-testid=chat-plan-dock-ready]");
  try {
    await dock.waitFor({ state: "visible", timeout: 60_000 });
  } catch {
    failures.push("plan-dock: chat-plan-dock-ready não visível");
    await page
      .screenshot({ path: resolve(OUT_DIR, "phase-plan-dock.png"), fullPage: true })
      .catch(() => {});
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
    await pollRunStatus(
      conversationId,
      (r) => r.status === "running",
      RUN_ACTIVE_TIMEOUT_MS,
      "running",
    );
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
    const working =
      (await page.locator("[data-testid=chat-working-line]").count()) +
      (await page.locator("[data-testid=forge-thinking]").count());
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

async function dismissPlanDockIfPresent(page) {
  const dock = page.locator("[data-testid=chat-plan-dock-ready]");
  if ((await dock.count()) < 1) return;
  const skip = dock.getByRole("button", { name: "Skip" });
  if ((await skip.count()) > 0) {
    await skip.click();
    await dock.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  }
}

async function phaseSecondTurn(page, conversationId, projectId, failures) {
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

  await dismissPlanDockIfPresent(page);

  if (projectId) {
    await page.evaluate((pid) => {
      localStorage.setItem(`forge:composer-mode:${pid}`, "build");
    }, projectId);
  }

  const secondPrompt = `[e2e-journey-2] ok (${Date.now()})`;
  const userCountBefore = await page.locator("[data-testid=chat-message-user]").count();
  await sendComposerMessage(page, secondPrompt);

  await page
    .locator("[data-testid=chat-message-user]")
    .nth(userCountBefore)
    .waitFor({ state: "visible", timeout: 15_000 });

  const secondText = await page
    .locator("[data-testid=chat-message-user]")
    .nth(userCountBefore)
    .innerText();
  if (!secondText.includes("[e2e-journey-2]")) {
    failures.push("second-turn: 2ª mensagem do usuário não apareceu");
  }

  await waitForWorkingLine(page, Math.max(THINKING_TIMEOUT_MS, 45_000), failures, "second-turn");
  await page.screenshot({ path: resolve(OUT_DIR, "phase-second-turn.png"), fullPage: true });
}

function needsNaturalAgentRun() {
  return (
    PHASES.has("inspector-live") ||
    PHASES.has("f5") ||
    PHASES.has("plan-dock") ||
    PHASES.has("second-turn")
  );
}

async function resolveE2eUserId(creds) {
  if (creds?.userId) return creds.userId;
  const email = creds?.email ?? process.env.E2E_EMAIL;
  if (!email || !SUPABASE_URL || !SERVICE_KEY) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 500, page: 1 });
  if (error) return null;
  const hit = data.users.find((u) => u.email?.trim().toLowerCase() === email.trim().toLowerCase());
  return hit?.id ?? null;
}

async function main() {
  const creds = await resolveE2eCredentials({
    supabaseUrl: SUPABASE_URL,
    serviceKey: SERVICE_KEY,
    anonKey: ANON_KEY,
  });

  const hasAuth =
    resolveStoragePath() ||
    (process.env.E2E_EMAIL && process.env.E2E_PASSWORD) ||
    (E2E_EMAIL && E2E_PASSWORD);
  if (!hasAuth) {
    const msg =
      "SKIP: defina E2E_EMAIL/E2E_PASSWORD, E2E_STORAGE_STATE, ou SUPABASE_SERVICE_ROLE_KEY (auto-provision)";
    if (REQUIRED) {
      console.error(`FAIL: ${msg}`);
      process.exit(1);
    }
    console.log(msg);
    process.exit(0);
  }

  await mkdir(OUT_DIR, { recursive: true });

  // Prompt natural: não força web_search nem outra tool — o agente decide se precisa.
  // Inspector-live valida timeline/stream (phase, explore, tool_*), não um tool específico.
  const defaultPrompt = PHASES.has("inspector-live")
    ? `[e2e-journey] Responda em 2 bullets sobre Vite 7 — sem editar arquivos (${Date.now()})`
    : PHASES.has("plan-dock")
      ? `[e2e-journey] Proponha um plano curto para adicionar um botão de contador no app — sem editar ainda (${Date.now()})`
      : `[e2e-journey] Responda apenas "ok" — sem editar arquivos (${Date.now()})`;
  const prompt = arg("prompt", defaultPrompt);

  console.log("Fases:", [...PHASES].join(", "));

  let e2eUserId = await resolveE2eUserId(creds);
  if (e2eUserId && SERVICE_KEY) {
    try {
      const seed = await seedE2eAgentSetup({
        supabaseUrl: SUPABASE_URL,
        serviceKey: SERVICE_KEY,
        userId: e2eUserId,
        patchPreferences: false,
      });
      console.log(
        `E2E pre-seed: openrouter=${seed.openrouterSource} model=${seed.model} e2b=${seed.e2bSource}`,
      );
    } catch (e) {
      console.warn("WARN: E2E pre-seed isolado falhou —", e instanceof Error ? e.message : e);
    }
  }

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
  let activeRunId = null;
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

    if (needsNaturalAgentRun() && !failures.length && projectId && conversationId) {
      activeRunId = await waitForNaturalAgentRun(page, conversationId, failures);
    }

    if (PHASES.has("inspector-live") && !failures.length) {
      await phaseInspectorLive(page, conversationId, failures, activeRunId);
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
      await phaseSecondTurn(page, conversationId, projectId, failures);
    }
  } catch (e) {
    failures.push(e instanceof Error ? e.message : String(e));
    await page
      .screenshot({ path: resolve(OUT_DIR, "journey-fail.png"), fullPage: true })
      .catch(() => {});
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
