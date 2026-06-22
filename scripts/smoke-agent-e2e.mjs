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

const DEFAULT_PROJECT = process.env.SMOKE_PROJECT_ID ?? "";
const DEFAULT_CONVERSATION = process.env.SMOKE_CONVERSATION_ID ?? "";
const DEFAULT_USER = process.env.SMOKE_USER_ID ?? "";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const projectId = arg("project-id", DEFAULT_PROJECT);
const conversationId = arg("conversation-id", DEFAULT_CONVERSATION);
const userId = arg("user-id", DEFAULT_USER);
const timeoutMs = Number(arg("timeout-ms", "90000"));
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

  if (!pid) {
    const res = await rest("projects?select=id,owner_id&order=updated_at.desc&limit=1");
    const [row] = await res.json();
    pid = row?.id;
    if (!uid) uid = row?.owner_id;
  }
  if (!cid && pid) {
    const res = await rest(`conversations?project_id=eq.${pid}&select=id&limit=1`);
    const [row] = await res.json();
    cid = row?.id;
  }
  if (!uid) {
    const res = await rest("projects?select=owner_id&limit=1");
    const [row] = await res.json();
    uid = row?.owner_id;
  }
  return { pid, cid, uid };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !INNGEST_EVENT_URL) {
    console.error(
      "FAIL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INNGEST_WEBHOOK (or INNGEST_EVENT_KEY) required",
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

  const runId = crypto.randomUUID();
  console.log(`Smoke run ${runId.slice(0, 8)} project=${projectIdResolved.slice(0, 8)}`);

  const prefsRes = await rest(
    `agent_runs?user_id=eq.${userIdResolved}&status=eq.completed&order=started_at.desc&limit=1&select=meta`,
  );
  const [lastRun] = await prefsRes.json();
  const smokePreferences = lastRun?.meta?.preferences?.mode
    ? lastRun.meta.preferences
    : { mode: "robin", poolProvider: "nvidia", robinPoolModelId: "nvidia--nemotron-3-ultra-550b" };

  const insertRes = await rest("agent_runs", {
    method: "POST",
    body: JSON.stringify({
      id: runId,
      project_id: projectIdResolved,
      conversation_id: conversationIdResolved,
      user_id: userIdResolved,
      status: "pending",
      meta: { sessionKind: "byok", smoke: true, preferences: smokePreferences },
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
    preferences: smokePreferences,
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
  console.log("Inngest event sent:", inngestBody.slice(0, 120));

  const deadline = Date.now() + timeoutMs;
  let lastEvents = [];

  while (Date.now() < deadline) {
    const evRes = await rest(
      `agent_stream_events?run_id=eq.${runId}&select=seq,event_type,created_at&order=seq.asc`,
    );
    lastEvents = await evRes.json();
    const types = lastEvents.map((e) => e.event_type);
    const rich = types.some((t) => t === "phase" || t.startsWith("tool_") || t === "text_delta");

    if (lastEvents.length > 1 && rich) {
      const runRes = await rest(`agent_runs?id=eq.${runId}&select=status,error,finished_at`);
      const [run] = await runRes.json();
      console.log("PASS: stream events", lastEvents.length, "types:", types.join(", "));
      console.log("Run status:", run?.status, run?.error ?? "");
      process.exit(0);
    }

    process.stdout.write(`  poll: ${lastEvents.length} events [${types.join(", ")}]\r`);
    await sleep(pollMs);
  }

  const runRes = await rest(`agent_runs?id=eq.${runId}&select=status,error,finished_at`);
  const [run] = await runRes.json();
  console.error("\nFAIL: timeout — no phase/tool events");
  console.error("Events:", JSON.stringify(lastEvents, null, 2));
  console.error("Run:", JSON.stringify(run, null, 2));
  console.error("Hint: Inngest dashboard → agent-build → execute-chunk-0");
  process.exit(1);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
