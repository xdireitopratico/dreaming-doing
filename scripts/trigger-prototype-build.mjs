#!/usr/bin/env node
/**
 * Dispara build do agente para validar/polir protótipo Android no projeto do usuário.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i);
    let val = t.slice(i + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const inngestKey = process.env.INNGEST_EVENT_KEY;
const projectId = process.env.SMOKE_PROJECT_ID ?? "27d4fd0c-9783-44ac-9446-70bd931620ac";
const conversationId = process.env.SMOKE_CONVERSATION_ID ?? "2bfca54a-3170-4a4d-9289-e8acab4d413f";
const userId = process.env.SMOKE_USER_ID ?? "2e8aca9f-1161-4246-9b33-3f2ca6c247d2";

const BUILD_PROMPT = `Valide e finalize o protótipo HermesVoice Android neste projeto misto (web + Kotlin).
- Confirme MainActivity, AudioRecordingService, Room (AppDatabase), Hilt DI e Retrofit.
- Corrija imports quebrados se existirem.
- Adicione README.md na raiz Android com instruções ./gradlew assembleDebug.
- Não sugira fork — este projeto misto é intencional.`;

function hdr() {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function main() {
  const prefsRes = await fetch(
    `${url}/rest/v1/agent_runs?user_id=eq.${userId}&status=eq.completed&order=started_at.desc&limit=1&select=meta`,
    { headers: hdr() },
  );
  const [lastRun] = await prefsRes.json();
  const preferences = lastRun?.meta?.preferences ?? {
    mode: "robin",
    poolProvider: "nvidia",
    robinPoolModelId: "nvidia--nemotron-3-ultra-550b",
  };

  const msgRes = await fetch(`${url}/rest/v1/messages`, {
    method: "POST",
    headers: { ...hdr(), Prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: conversationId,
      role: "user",
      parts: [{ type: "text", text: BUILD_PROMPT }],
      meta: { kind: "prototype_build" },
    }),
  });
  if (!msgRes.ok) throw new Error(`message insert: ${await msgRes.text()}`);
  const [msg] = await msgRes.json();
  console.log("User message:", msg.id?.slice(0, 8));

  const runId = crypto.randomUUID();
  const runRes = await fetch(`${url}/rest/v1/agent_runs`, {
    method: "POST",
    headers: { ...hdr(), Prefer: "return=representation" },
    body: JSON.stringify({
      id: runId,
      project_id: projectId,
      conversation_id: conversationId,
      user_id: userId,
      status: "pending",
      meta: { sessionKind: "byok", preferences, prototype: true },
    }),
  });
  if (!runRes.ok) throw new Error(`run insert: ${await runRes.text()}`);
  console.log("Run:", runId);

  const inngestRes = await fetch(`https://inn.gs/e/${inngestKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "agent/build.requested",
      data: {
        runId,
        projectId,
        conversationId,
        userId,
        sessionKind: "byok",
        preferences,
        planMode: false,
        resume: false,
      },
      ts: Date.now(),
    }),
  });
  console.log("Inngest:", await inngestRes.text());

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const evRes = await fetch(
      `${url}/rest/v1/agent_stream_events?select=event_type&run_id=eq.${runId}&order=seq.desc&limit=20`,
      { headers: hdr() },
    );
    const events = await evRes.json();
    const runRow = await fetch(`${url}/rest/v1/agent_runs?id=eq.${runId}&select=status,error`, {
      headers: hdr(),
    });
    const [run] = await runRow.json();
    const types = events.map((e) => e.event_type).reverse();
    process.stdout.write(
      `\r  status=${run?.status} events=${events.length} [${types.slice(-5).join(",")}]   `,
    );
    if (["completed", "failed", "canceled", "awaiting_user"].includes(run?.status)) {
      console.log(`\nDone: ${run.status}`, run.error ?? "");
      const toolDone = events.filter((e) => e.event_type === "tool_done").length;
      console.log(`tool_done count: ${toolDone}`);
      process.exit(run.status === "completed" ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error("\nTimeout waiting for agent");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
