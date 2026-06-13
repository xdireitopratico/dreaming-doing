#!/usr/bin/env node
/**
 * E2E smoke T32: slug-based gateway → Inngest → execute_step → completed.
 *
 * Validates production path (not action=test):
 *   1. agent_deployments + published flow
 *   2. POST aetherforge-gateway { slug, message } → inngest_queued (or inline_fallback)
 *   3. agent_executions reaches completed with tool step
 *
 * Usage:
 *   node scripts/smoke-gateway-inngest-e2e.mjs
 *   node scripts/smoke-gateway-inngest-e2e.mjs --slug=smoke-gateway-inngest
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

const SMOKE_SLUG = "smoke-gateway-inngest";
const FLOW_NAME = "Smoke T32 Gateway Inngest";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const slug = arg("slug", SMOKE_SLUG);
const userIdArg = arg("user-id", process.env.SMOKE_USER_ID ?? "");
const timeoutMs = Number(arg("timeout-ms", "120000"));
const workerWaitMs = Number(arg("worker-wait-ms", "30000"));
const strictInngest = process.argv.includes("--strict-inngest");
const pollMs = 2000;

const FLOW_DEF = {
  nodes: [
    {
      id: "trigger_1",
      type: "trigger",
      position: { x: 0, y: 0 },
      data: { label: "Trigger" },
    },
    {
      id: "tool_1",
      type: "tool",
      position: { x: 300, y: 0 },
      data: {
        label: "Condition",
        config: {
          tool_name: "condition_eval",
          tool_input: { expression: "true", variables: {} },
        },
      },
    },
  ],
  edges: [{ id: "e1", source: "trigger_1", target: "tool_1" }],
};

function rest(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: init.method === "POST" ? "return=representation" : undefined,
      ...(init.headers || {}),
    },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveUserId() {
  if (userIdArg) return userIdArg;
  const flows = await rest("agent_flows?select=user_id&limit=1").then((r) => r.json());
  if (flows?.[0]?.user_id) return flows[0].user_id;
  const projects = await rest("projects?select=owner_id&limit=1").then((r) => r.json());
  return projects?.[0]?.owner_id ?? null;
}

async function ensurePublishedFlow(userId) {
  const existing = await rest(
    `agent_flows?user_id=eq.${userId}&name=eq.${encodeURIComponent(FLOW_NAME)}&select=id,status&limit=1`,
  ).then((r) => r.json());

  if (existing?.[0]?.id) {
    const flowId = existing[0].id;
    await rest(`agent_flows?id=eq.${flowId}`, {
      method: "PATCH",
      body: JSON.stringify({
        flow_definition: FLOW_DEF,
        status: "published",
        updated_at: new Date().toISOString(),
      }),
    });
    return flowId;
  }

  const createRes = await rest("agent_flows", {
    method: "POST",
    body: JSON.stringify({
      name: FLOW_NAME,
      description: "Auto-created by smoke-gateway-inngest-e2e",
      user_id: userId,
      status: "published",
      flow_definition: FLOW_DEF,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Falha ao criar flow: ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created[0].id;
}

async function ensureDeployment(flowId) {
  const existing = await rest(
    `agent_deployments?endpoint_slug=eq.${slug}&select=id,flow_id,is_active&limit=1`,
  ).then((r) => r.json());

  if (existing?.[0]?.id) {
    if (existing[0].flow_id !== flowId || !existing[0].is_active) {
      await rest(`agent_deployments?id=eq.${existing[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({ flow_id: flowId, is_active: true, channel: "web" }),
      });
    }
    return existing[0].id;
  }

  const createRes = await rest("agent_deployments", {
    method: "POST",
    body: JSON.stringify({
      flow_id: flowId,
      channel: "web",
      endpoint_slug: slug,
      is_active: true,
      channel_config: {},
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Falha ao criar deployment: ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created[0].id;
}

async function invokeSlugGateway(sessionId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/aetherforge-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY || SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      slug,
      message: "T32 smoke — gateway Inngest production path",
      session_id: sessionId,
      channel: "test",
      metadata: { smoke: "gateway-inngest" },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    throw new Error(`gateway HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body };
}

async function getExecution(executionId) {
  const rows = await rest(
    `agent_executions?id=eq.${executionId}&select=id,status,nodes_executed,completed_at`,
  ).then((r) => r.json());
  return rows?.[0] ?? null;
}

async function pollExecution(executionId, maxMs) {
  const deadline = Date.now() + maxMs;
  let last = null;

  while (Date.now() < deadline) {
    last = await getExecution(executionId);
    if (last?.status === "completed" || last?.status === "failed") {
      return last;
    }
    process.stdout.write(`  poll: status=${last?.status ?? "?"} nodes=${last?.nodes_executed ?? 0}\n`);
    await sleep(pollMs);
  }

  return last;
}

async function invokeExecuteStep(executionId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/aetherforge-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY || SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "execute_step", execution_id: executionId }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`execute_step HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function driveExecuteStepFallback(executionId) {
  console.warn("  ⚠ Inngest worker não processou — a conduzir execute_step (redeploy Vercel necessário)");
  let lastBody = null;
  for (let i = 0; i < 50; i++) {
    lastBody = await invokeExecuteStep(executionId);
    if (lastBody.status === "completed" || lastBody.status === "failed" || lastBody.status === "paused") {
      return lastBody;
    }
    process.stdout.write(`  step ${i}: status=${lastBody.status}\n`);
  }
  throw new Error(`execute_step fallback excedeu budget para ${executionId}`);
}

function findToolStep(steps) {
  return steps?.find((s) => s.node_type === "tool");
}

async function fetchDbToolStep(executionId) {
  const rows = await rest(
    `agent_execution_steps?execution_id=eq.${executionId}&node_type=eq.tool&select=node_id,node_type,tool_name,status&order=step_order.asc&limit=1`,
  ).then((r) => r.json());
  return rows?.[0] ?? null;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("✗ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (.env.local)");
    process.exit(1);
  }

  console.log("→ Smoke gateway Inngest (T32 slug path)");

  const userId = await resolveUserId();
  if (!userId) {
    console.error("✗ Nenhum user_id — passe --user-id=");
    process.exit(1);
  }

  const flowId = await ensurePublishedFlow(userId);
  console.log(`  ✓ flow published: ${flowId}`);

  const deploymentId = await ensureDeployment(flowId);
  console.log(`  ✓ deployment slug=${slug}: ${deploymentId}`);

  const sessionId = `smoke-t32-${crypto.randomUUID()}`;
  const { status: httpStatus, body: gw } = await invokeSlugGateway(sessionId);

  if (!gw.execution_id) {
    throw new Error(`gateway sem execution_id: ${JSON.stringify(gw)}`);
  }

  const executor = gw.executor ?? "unknown";
  console.log(`  ✓ gateway ${httpStatus} executor=${executor} execution=${gw.execution_id}`);

  if (executor === "inline_fallback") {
    console.warn(
      "  ⚠ INNGEST_EVENT_KEY ausente na Edge — fallback inline (configure em Supabase secrets)",
    );
  } else if (executor !== "inngest_queued") {
    console.warn(`  ⚠ executor inesperado: ${executor}`);
  }

  let finalStatus = gw.status;
  let executionRow = null;
  let responseSteps = gw.steps ?? [];
  let driver = executor === "inline_fallback" ? "inline_fallback" : "inngest_worker";

  if (finalStatus === "completed" || finalStatus === "failed") {
    executionRow = {
      id: gw.execution_id,
      status: finalStatus,
      nodes_executed: gw.steps_count,
    };
  } else if (executor === "inngest_queued") {
    console.log(`  → aguardando Inngest worker (${workerWaitMs / 1000}s)…`);
    executionRow = await pollExecution(gw.execution_id, workerWaitMs);
    finalStatus = executionRow?.status ?? "unknown";

    if (finalStatus !== "completed" && finalStatus !== "failed") {
      if (strictInngest) {
        throw new Error(
          `Inngest worker não processou em ${workerWaitMs}ms (status=${finalStatus}) — faça redeploy Vercel com build:inngest`,
        );
      }
      const fallback = await driveExecuteStepFallback(gw.execution_id);
      finalStatus = fallback.status;
      responseSteps = fallback.steps ?? responseSteps;
      driver = "execute_step_fallback";
      executionRow = await getExecution(gw.execution_id);
    }
  } else {
    executionRow = await pollExecution(gw.execution_id, timeoutMs);
    finalStatus = executionRow?.status ?? "unknown";
  }

  if (finalStatus !== "completed") {
    throw new Error(`execution terminou com status=${finalStatus}`);
  }

  const toolStep = findToolStep(responseSteps);
  const dbToolStep = await fetchDbToolStep(gw.execution_id);
  const nodesExecuted = executionRow?.nodes_executed ?? gw.steps_count ?? responseSteps.length;
  if (!toolStep && !dbToolStep && nodesExecuted < 2) {
    throw new Error(`sem step de tool (response=${JSON.stringify(responseSteps)}, db=null)`);
  }
  if (!dbToolStep) {
    throw new Error("agent_execution_steps sem trace persistido — verifique migration node_id TEXT");
  }

  console.log(`  ✓ execution completed nodes=${nodesExecuted} driver=${driver}`);
  const toolName = dbToolStep.tool_name ?? toolStep?.output?.tool_name ?? dbToolStep.node_type;
  console.log(`  ✓ tool step DB: ${toolName} node=${dbToolStep.node_id} (${dbToolStep.status})`);
  if (driver === "execute_step_fallback") {
    console.log("  ℹ Redeploy Vercel (npm run build:inngest) para registar gateway-flow-execute no Inngest");
  }
  console.log("\n✓ Smoke gateway Inngest passou");
}

main().catch((err) => {
  console.error("✗", err.message || err);
  process.exit(1);
});