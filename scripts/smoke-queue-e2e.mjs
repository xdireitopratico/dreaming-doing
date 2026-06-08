#!/usr/bin/env node
/**
 * E2E smoke: agent_pending_messages → continue_queue → pending drena.
 *
 * Usage:
 *   node scripts/smoke-queue-e2e.mjs
 *   node scripts/smoke-queue-e2e.mjs --project-id=UUID --conversation-id=UUID --user-id=UUID
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

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY ?? "";

const DEFAULT_PROJECT =
  process.env.SMOKE_PROJECT_ID ?? "27d4fd0c-9783-44ac-9446-70bd931620ac";
const DEFAULT_CONVERSATION =
  process.env.SMOKE_CONVERSATION_ID ?? "2bfca54a-3170-4a4d-9289-e8acab4d413f";
const DEFAULT_USER =
  process.env.SMOKE_USER_ID ?? "2e8aca9f-1161-4246-9b33-3f2ca6c247d2";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const projectId = arg("project-id", DEFAULT_PROJECT);
const conversationId = arg("conversation-id", DEFAULT_CONVERSATION);
const userId = arg("user-id", DEFAULT_USER);
const timeoutMs = Number(arg("timeout-ms", "60000"));
const pollMs = 1500;

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

async function countPending() {
  const res = await rest(
    `agent_pending_messages?project_id=eq.${projectId}&user_id=eq.${userId}&select=id`,
  );
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

async function clearBlockingRuns() {
  await rest(
    `agent_runs?project_id=eq.${projectId}&status=in.(running,pending,awaiting_user)`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: "smoke-queue cleanup",
      }),
    },
  );
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("FAIL: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  if (!INNGEST_EVENT_KEY) {
    console.warn("WARN: INNGEST_EVENT_KEY missing — continue_queue may return inngest_failed");
  }

  console.log(`Smoke queue project=${projectId.slice(0, 8)}`);

  await clearBlockingRuns();
  await rest(
    `agent_pending_messages?project_id=eq.${projectId}&user_id=eq.${userId}`,
    { method: "DELETE" },
  );

  const payloads = [
    { text: "[smoke] fila mensagem 1", sessionKind: "byok" },
    { text: "[smoke] fila mensagem 2", sessionKind: "byok" },
  ];

  for (const body of payloads) {
    const ins = await rest("agent_pending_messages", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        conversation_id: conversationId,
        user_id: userId,
        body,
      }),
    });
    if (!ins.ok) {
      const t = await ins.text();
      console.error("FAIL: insert pending", ins.status, t.slice(0, 300));
      process.exit(1);
    }
  }

  const before = await countPending();
  if (before !== 2) {
    console.error("FAIL: expected 2 pending, got", before);
    process.exit(1);
  }
  console.log("Enqueued 2 pending messages");

  const edgeRes = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({
      action: "continue_queue",
      projectId,
      conversationId,
      userId,
    }),
  });
  const edgeBody = await edgeRes.json();
  if (!edgeRes.ok) {
    console.error("FAIL: continue_queue HTTP", edgeRes.status, JSON.stringify(edgeBody));
    process.exit(1);
  }
  console.log("continue_queue:", JSON.stringify(edgeBody));

  if (edgeBody.reason === "inngest_failed") {
    console.error("FAIL: INNGEST_EVENT_KEY not configured on Edge");
    process.exit(1);
  }

  const deadline = Date.now() + timeoutMs;
  let last = before;

  while (Date.now() < deadline) {
    last = await countPending();
    if (last < before) {
      console.log(`PASS: pending drained ${before} → ${last}`);
      if (edgeBody.continued && edgeBody.runId) {
        console.log("New run:", edgeBody.runId);
      }
      process.exit(0);
    }
    process.stdout.write(`  poll pending: ${last}\r`);
    await sleep(pollMs);
  }

  console.error("\nFAIL: timeout — pending still", last);
  process.exit(1);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});