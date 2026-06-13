#!/usr/bin/env node
/**
 * E2E smoke: agent_flows → aetherforge-gateway action "test".
 *
 * Usage:
 *   node scripts/smoke-aetherforge-e2e.mjs
 *   node scripts/smoke-aetherforge-e2e.mjs --flow-id=UUID --user-id=UUID
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
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const flowIdArg = arg("flow-id", "");
const userIdArg = arg("user-id", process.env.SMOKE_USER_ID ?? "");
const timeoutMs = Number(arg("timeout-ms", "60000"));

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

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("✗ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (.env.local)");
    process.exit(1);
  }

  console.log("→ Smoke AetherForge gateway (action=test)");

  // 1. Healthz
  const healthRes = await fetch(`${SUPABASE_URL}/functions/v1/aetherforge-healthz`);
  const health = await healthRes.json().catch(() => ({}));
  if (!healthRes.ok || health.status !== "healthy") {
    console.error("✗ aetherforge-healthz:", health);
    process.exit(1);
  }
  console.log("  ✓ healthz healthy");

  // 2. Resolve user
  let userId = userIdArg;
  if (!userId) {
    const flowsRes = await rest("agent_flows?select=user_id&limit=1");
    const flows = await flowsRes.json();
    userId = flows?.[0]?.user_id;
  }
  if (!userId) {
    const projRes = await rest("projects?select=owner_id&limit=1");
    const projects = await projRes.json();
    userId = projects?.[0]?.owner_id;
  }
  if (!userId) {
    console.error("✗ Nenhum user_id — passe --user-id= ou crie um agent_flow");
    process.exit(1);
  }

  // 3. Resolve or create test flow
  let flowId = flowIdArg;
  if (!flowId) {
    const existing = await rest(
      `agent_flows?user_id=eq.${userId}&select=id,flow_definition&order=updated_at.desc&limit=5`,
    );
    const flows = await existing.json();
    const withNodes = flows?.find((f) => f.flow_definition?.nodes?.length > 0);
    flowId = withNodes?.id;
  }

  if (!flowId) {
    const minimalFlow = {
      nodes: [
        {
          id: "trigger_1",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: { label: "Trigger" },
        },
        {
          id: "llm_1",
          type: "llm",
          position: { x: 300, y: 0 },
          data: {
            label: "LLM",
            config: { model_id: "google/gemini-2.5-flash", temperature: 0.3, max_tokens: 256 },
          },
        },
      ],
      edges: [{ id: "e1", source: "trigger_1", target: "llm_1" }],
    };

    const createRes = await rest("agent_flows", {
      method: "POST",
      body: JSON.stringify({
        name: "Smoke Test Flow",
        description: "Auto-created by smoke-aetherforge-e2e",
        user_id: userId,
        status: "draft",
        flow_definition: minimalFlow,
      }),
    });
    if (!createRes.ok) {
      console.error("✗ Falha ao criar agent_flow:", await createRes.text());
      process.exit(1);
    }
    const created = (await createRes.json())[0];
    flowId = created.id;
    console.log(`  ✓ agent_flow criado: ${flowId}`);
  } else {
    console.log(`  ✓ agent_flow: ${flowId}`);
  }

  // 4. Gateway test (service role — gateway uses service client for test)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const gwRes = await fetch(`${SUPABASE_URL}/functions/v1/aetherforge-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY || SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "test",
      flow_id: flowId,
      message: "Responda apenas: OK",
      session_id: crypto.randomUUID(),
      channel: "test",
    }),
    signal: controller.signal,
  });
  clearTimeout(timer);

  const gwBody = await gwRes.json().catch(() => ({}));
  if (!gwRes.ok) {
    console.error(`✗ gateway HTTP ${gwRes.status}:`, gwBody);
    process.exit(1);
  }

  const status = gwBody.status || gwBody.execution_status;
  const hasOutput = gwBody.output || gwBody.final_output || gwBody.steps?.length > 0;
  if (!hasOutput && status !== "completed" && status !== "paused") {
    console.error("✗ gateway sem output:", gwBody);
    process.exit(1);
  }

  console.log(`  ✓ gateway test OK (status=${status ?? "ok"}, steps=${gwBody.steps?.length ?? "?"})`);
  console.log("✓ Smoke AetherForge passou");
}

main().catch((err) => {
  console.error("✗", err.message || err);
  process.exit(1);
});