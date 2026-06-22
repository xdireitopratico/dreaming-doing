/**
 * Bootstrap agent run via Inngest — mesmo contrato do smoke-agent-e2e.mjs.
 */
import { randomUUID } from "node:crypto";
import { resolveInngestEventUrl } from "./inngest-event-url.mjs";
import { E2E_AGENT_PREFERENCES } from "./e2e-agent-setup.mjs";

function restHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rest(supabaseUrl, serviceKey, path, init = {}) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(serviceKey), ...(init.headers ?? {}) },
  });
}

async function failStaleRuns(supabaseUrl, serviceKey, conversationId) {
  const res = await rest(
    supabaseUrl,
    serviceKey,
    `agent_runs?conversation_id=eq.${conversationId}&status=in.(pending,running)&select=id`,
  );
  const rows = await res.json();
  const now = new Date().toISOString();
  for (const row of rows ?? []) {
    await rest(supabaseUrl, serviceKey, `agent_runs?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        finished_at: now,
        error: "e2e bootstrap — run anterior substituída",
      }),
    });
  }
  return rows?.length ?? 0;
}

/**
 * Cria agent_run + dispara Inngest + evento start no stream.
 * @returns {Promise<{ runId: string, eventId: string }>}
 */
export async function bootstrapAgentRun({
  supabaseUrl,
  serviceKey,
  projectId,
  conversationId,
  userId,
  preferences = E2E_AGENT_PREFERENCES,
  planMode = false,
  meta = {},
}) {
  const inngestUrl = resolveInngestEventUrl();
  if (!supabaseUrl || !serviceKey || !inngestUrl) {
    throw new Error("bootstrapAgentRun: SUPABASE_URL, SERVICE_ROLE_KEY, INNGEST_EVENT_KEY obrigatórios");
  }
  if (!projectId || !conversationId || !userId) {
    throw new Error("bootstrapAgentRun: projectId, conversationId e userId obrigatórios");
  }

  const cleaned = await failStaleRuns(supabaseUrl, serviceKey, conversationId);
  if (cleaned > 0) {
    console.log(`E2E bootstrap: ${cleaned} run(s) stale marcada(s) failed`);
  }

  const runId = randomUUID();
  const runMeta = {
    sessionKind: "byok",
    e2e: true,
    preferences,
    ...meta,
  };

  const insertRes = await rest(supabaseUrl, serviceKey, "agent_runs", {
    method: "POST",
    body: JSON.stringify({
      id: runId,
      project_id: projectId,
      conversation_id: conversationId,
      user_id: userId,
      status: "pending",
      meta: runMeta,
    }),
  });
  if (!insertRes.ok) {
    const t = await insertRes.text();
    throw new Error(`bootstrapAgentRun insert agent_runs: ${insertRes.status} ${t.slice(0, 300)}`);
  }

  const eventPayload = {
    runId,
    projectId,
    conversationId,
    userId,
    sessionKind: "byok",
    preferences,
    enabledSkillIds: [],
    enabledMcpIds: [],
    planMode,
    resume: false,
  };

  const inngestRes = await fetch(inngestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: planMode ? "agent/plan.requested" : "agent/build.requested",
      data: eventPayload,
      ts: Date.now(),
    }),
  });
  const inngestBody = await inngestRes.text();
  if (!inngestRes.ok) {
    throw new Error(`bootstrapAgentRun Inngest: ${inngestRes.status} ${inngestBody.slice(0, 300)}`);
  }

  let eventId = null;
  try {
    const parsed = JSON.parse(inngestBody);
    eventId = parsed.ids?.[0] ?? null;
  } catch {
    /* non-json */
  }
  if (!eventId) {
    throw new Error(`bootstrapAgentRun: Inngest sem event id — ${inngestBody.slice(0, 200)}`);
  }

  await rest(supabaseUrl, serviceKey, "agent_stream_events", {
    method: "POST",
    body: JSON.stringify({
      id: randomUUID(),
      run_id: runId,
      seq: 1,
      event_type: "start",
      payload: {
        type: "start",
        runId,
        projectId,
        conversationId,
        mode: planMode ? "plan" : "build",
        eventId,
        e2e: true,
      },
    }),
  });

  console.log(`E2E bootstrap: run ${runId.slice(0, 8)} event ${eventId.slice(0, 8)}`);
  return { runId, eventId };
}

/**
 * Poll até run atingir status ou timeout (para sincronizar fases browser).
 */
export async function waitForRunStatus({
  supabaseUrl,
  serviceKey,
  runId,
  predicate,
  timeoutMs = 90_000,
  pollMs = 2000,
  label = "predicate",
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await rest(
      supabaseUrl,
      serviceKey,
      `agent_runs?id=eq.${runId}&select=id,status,error,finished_at`,
    );
    const [run] = await res.json();
    if (run && predicate(run)) return run;
    await sleep(pollMs);
  }
  throw new Error(`timeout aguardando run ${label} (${timeoutMs}ms)`);
}