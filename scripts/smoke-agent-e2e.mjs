#!/usr/bin/env node
/**
 * E2E smoke: Inngest event → execute → agent_stream_events grows past start.
 *
 * Usage:
 *   node scripts/smoke-agent-e2e.mjs
 *   node scripts/smoke-agent-e2e.mjs --project-id=UUID --conversation-id=UUID
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveInngestEventUrl } from "./lib/inngest-event-url.mjs";
import { seedE2eAgentSetup } from "./lib/e2e-agent-setup.mjs";
import { isTerminalHonest } from "./lib/smoke-terminal.mjs";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const key = t.slice(0, i);
      let val = t.slice(i + 1);
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // optional
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const INNGEST_EVENT_URL = resolveInngestEventUrl();

/** Projeto secundário — evita colisão com o editor ativo no projeto principal. */
const DEFAULT_PROJECT = process.env.SMOKE_PROJECT_ID ?? "5c9e3206-fcf5-4afd-ad6e-0a0cb536fafe";
const DEFAULT_CONVERSATION =
  process.env.SMOKE_CONVERSATION_ID ?? "1ef54848-8d3a-4a39-b47c-eedb8e115de4";
const DEFAULT_USER = process.env.SMOKE_USER_ID ?? "2e8aca9f-1161-4246-9b33-3f2ca6c247d2";

const SMOKE_PROMPT =
  "[smoke] Liste os arquivos na raiz do projeto (resposta curta, sem editar código).";

/**
 * Preferências de smoke — OpenRouter free por padrão (sem rate limit Groq).
 * Override: SMOKE_MODE=robin SMOKE_POOL_PROVIDER=groq SMOKE_ROBIN_MODEL=pool-groq-flash
 */
const SMOKE_PREFERENCES = {
  mode: process.env.SMOKE_MODE ?? "fixed",
  useCustomModel: process.env.SMOKE_MODE ? undefined : true,
  customModelId: process.env.SMOKE_MODEL ?? "nex-agi/nex-n2-pro:free",
  poolProvider: process.env.SMOKE_POOL_PROVIDER,
  robinPoolModelId: process.env.SMOKE_ROBIN_MODEL,
};
if (SMOKE_PREFERENCES.mode === "robin") {
  delete SMOKE_PREFERENCES.useCustomModel;
  delete SMOKE_PREFERENCES.customModelId;
  SMOKE_PREFERENCES.poolProvider = SMOKE_PREFERENCES.poolProvider ?? "groq";
  SMOKE_PREFERENCES.robinPoolModelId = SMOKE_PREFERENCES.robinPoolModelId ?? "pool-groq-flash";
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const projectId = arg("project-id", DEFAULT_PROJECT);
const conversationId = arg("conversation-id", DEFAULT_CONVERSATION);
const userId = arg("user-id", DEFAULT_USER);
const timeoutMs = Number(arg("timeout-ms", "300000"));
const dispatchTimeoutMs = Number(arg("dispatch-timeout-ms", "45000"));
const pollMs = 2000;

function rest(path, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveSmokeIds() {
  let pid = projectId;
  let cid = conversationId;
  let uid = userId;

  if (pid) {
    const res = await rest(`projects?id=eq.${pid}&select=id,owner_id&limit=1`);
    const [row] = await res.json();
    if (!row?.id) pid = "";
    else if (!uid) uid = row.owner_id;
  }

  if (!pid) {
    const res = await rest("projects?select=id,owner_id&order=updated_at.desc&limit=5");
    const rows = await res.json();
    for (const row of rows ?? []) {
      const cRes = await rest(`conversations?project_id=eq.${row.id}&select=id&limit=1`);
      const [conv] = await cRes.json();
      if (conv?.id) {
        pid = row.id;
        cid = conv.id;
        if (!uid) uid = row.owner_id;
        break;
      }
    }
  }

  if (pid && cid) {
    const res = await rest(
      `conversations?id=eq.${cid}&project_id=eq.${pid}&select=id&limit=1`,
    );
    const [row] = await res.json();
    if (!row?.id) cid = "";
  }

  if (pid && !cid) {
    const res = await rest(`conversations?project_id=eq.${pid}&select=id&limit=1`);
    const [row] = await res.json();
    cid = row?.id;
  }

  if (!uid && pid) {
    const res = await rest(`projects?id=eq.${pid}&select=owner_id&limit=1`);
    const [row] = await res.json();
    uid = row?.owner_id;
  }

  return { pid, cid, uid };
}

async function cleanupStaleSmokeRuns(projectIdResolved) {
  const res = await rest(
    `agent_runs?project_id=eq.${projectIdResolved}&meta->>smoke=eq.true&status=in.(pending,running)&select=id`,
  );
  const rows = await res.json();
  const now = new Date().toISOString();
  for (const row of rows ?? []) {
    await rest(`agent_runs?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        finished_at: now,
        error: "smoke cleanup — run anterior expirada",
      }),
    });
  }
  if (rows?.length) {
    console.log(`Cleanup: ${rows.length} smoke run(s) pendente(s) marcada(s) failed`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !INNGEST_EVENT_URL) {
    console.error(
      "FAIL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY required",
    );
    process.exit(1);
  }

  const resolved = await resolveSmokeIds();
  const projectIdResolved = resolved.pid;
  const conversationIdResolved = resolved.cid;
  const userIdResolved = resolved.uid;

  if (!projectIdResolved || !conversationIdResolved || !userIdResolved) {
    console.error(
      "FAIL: project/conversation/user não encontrados — defina SMOKE_PROJECT_ID, SMOKE_CONVERSATION_ID, SMOKE_USER_ID",
    );
    process.exit(1);
  }

  await cleanupStaleSmokeRuns(projectIdResolved);

  const seed = await seedE2eAgentSetup({
    supabaseUrl: SUPABASE_URL,
    serviceKey: SERVICE_KEY,
    userId: userIdResolved,
  });
  console.log(
    `Seed: openrouter=${seed.openrouterSource} model=${seed.model} e2b=${seed.e2bSource}`,
  );

  const msgRes = await rest("messages", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationIdResolved,
      role: "user",
      parts: [{ type: "text", text: SMOKE_PROMPT }],
      meta: { smoke: true },
    }),
  });
  if (!msgRes.ok) {
    const t = await msgRes.text();
    console.error("FAIL: insert message", msgRes.status, t.slice(0, 300));
    process.exit(1);
  }

  const runId = crypto.randomUUID();
  console.log(`Smoke run ${runId.slice(0, 8)} project=${projectIdResolved.slice(0, 8)}`);

  const insertRes = await rest("agent_runs", {
    method: "POST",
    body: JSON.stringify({
      id: runId,
      project_id: projectIdResolved,
      conversation_id: conversationIdResolved,
      user_id: userIdResolved,
      status: "pending",
      meta: {
        sessionKind: "byok",
        smoke: true,
        preferences: SMOKE_PREFERENCES,
      },
    }),
  });
  if (!insertRes.ok) {
    const t = await insertRes.text();
    console.error("FAIL: insert agent_runs", insertRes.status, t.slice(0, 300));
    process.exit(1);
  }

  const eventPayload = {
    runId,
    projectId: projectIdResolved,
    conversationId: conversationIdResolved,
    userId: userIdResolved,
    sessionKind: "byok",
    preferences: SMOKE_PREFERENCES,
    enabledSkillIds: [],
    enabledMcpIds: [],
    planMode: false,
    resume: false,
  };

  const inngestRes = await fetch(INNGEST_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "agent/build.requested",
      data: eventPayload,
      ts: Date.now(),
    }),
  });
  const inngestBody = await inngestRes.text();
  if (!inngestRes.ok) {
    console.error("FAIL: Inngest send", inngestRes.status, inngestBody.slice(0, 300));
    process.exit(1);
  }

  let eventId = null;
  try {
    const parsed = JSON.parse(inngestBody);
    eventId = parsed.ids?.[0] ?? null;
  } catch {
    // non-json body
  }
  if (!eventId) {
    console.error("FAIL: Inngest returned no event ids", inngestBody.slice(0, 300));
    process.exit(1);
  }
  console.log("Inngest event sent:", eventId);

  await rest("agent_stream_events", {
    method: "POST",
    body: JSON.stringify({
      id: crypto.randomUUID(),
      run_id: runId,
      seq: 1,
      event_type: "start",
      payload: {
        type: "start",
        runId,
        projectId: projectIdResolved,
        conversationId: conversationIdResolved,
        mode: "build",
        eventId,
        smoke: true,
      },
    }),
  });

  const deadline = Date.now() + timeoutMs;
  const dispatchDeadline = Date.now() + dispatchTimeoutMs;
  let lastEvents = [];
  let lastRun = { status: "pending" };

  while (Date.now() < deadline) {
    const evRes = await rest(
      `agent_stream_events?run_id=eq.${runId}&select=seq,event_type,created_at&order=seq.asc`,
    );
    lastEvents = await evRes.json();
    const types = lastEvents.map((e) => e.event_type);

    const runRes = await rest(
      `agent_runs?id=eq.${runId}&select=status,error,finished_at,heartbeat_at`,
    );
    [lastRun] = await runRes.json();

    if (lastRun?.status === "canceled") {
      console.error("\nFAIL: run canceled — use SMOKE_PROJECT_ID isolado ou cancele runs no editor");
      console.error("Run:", JSON.stringify(lastRun, null, 2));
      console.error("Events:", JSON.stringify(lastEvents, null, 2));
      process.exit(1);
    }

    if (lastRun?.status === "failed" && lastRun?.error) {
      console.error("\nFAIL: run failed:", lastRun.error);
      console.error("Events:", JSON.stringify(lastEvents, null, 2));
      process.exit(1);
    }

    if (isTerminalHonest(types, lastRun?.status)) {
      console.log("PASS: terminal honesto —", lastEvents.length, "events:", types.join(", "));
      console.log("Run status:", lastRun?.status, lastRun?.error ?? "");
      process.exit(0);
    }

    if (
      Date.now() > dispatchDeadline &&
      lastRun?.status === "pending" &&
      types.length <= 1
    ) {
      console.error("\nFAIL: Inngest não iniciou a run (ainda pending após dispatch timeout)");
      console.error("Event URL:", INNGEST_EVENT_URL);
      console.error("Hint: verifique sync em Inngest dashboard → Apps → dreaming-doing → Sync");
      console.error("Hint: npm run check:inngest && vercel deploy --prod");
      process.exit(1);
    }

    process.stdout.write(
      `  poll: status=${lastRun?.status} events=${lastEvents.length} [${types.join(", ")}]\r`,
    );
    await sleep(pollMs);
  }

  const lastEv = lastEvents.at(-1);
  const stallHint =
    lastEvents.length > 1
      ? `run ainda ${lastRun?.status} após ${timeoutMs / 1000}s — último evento: ${lastEv?.event_type ?? "?"} (seq ${lastEv?.seq ?? "?"})`
      : "sem progresso no stream após dispatch";
  console.error(`\nFAIL: timeout — ${stallHint}`);
  console.error("Preferences:", JSON.stringify(SMOKE_PREFERENCES));
  console.error("Events:", JSON.stringify(lastEvents.slice(-8), null, 2));
  console.error("Run:", JSON.stringify(lastRun, null, 2));
  console.error(
    "Hint: pool lento? SMOKE_POOL_PROVIDER=groq (default) ou aumente --timeout-ms=600000",
  );
  console.error("Hint: Inngest dashboard → agent-build → execute-loop-0");
  process.exit(1);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});