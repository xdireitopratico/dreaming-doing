#!/usr/bin/env node
/**
 * E2E smoke T19: gateway tool execution + tenant_secrets injection.
 *
 * Validates:
 *   1. tool_registry hit (email_send)
 *   2. tenant_secrets stored on flowId (same as SecretsPanel)
 *   3. aetherforge-gateway executes tool node (reaches Resend API or succeeds)
 *
 * Usage:
 *   node scripts/smoke-gateway-tenant-secrets-e2e.mjs
 *   node scripts/smoke-gateway-tenant-secrets-e2e.mjs --tool=email_send
 *   node scripts/smoke-gateway-tenant-secrets-e2e.mjs --tool=web_scrape
 *   node scripts/smoke-gateway-tenant-secrets-e2e.mjs --tool=all
 *   SMOKE_RESEND_API_KEY=re_xxx node scripts/smoke-gateway-tenant-secrets-e2e.mjs
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

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const toolName = arg("tool", "email_send");
const userIdArg = arg("user-id", process.env.SMOKE_USER_ID ?? "");
const flowIdArg = arg("flow-id", "");
const timeoutMs = Number(arg("timeout-ms", "90000"));

const TOOL_FLOWS = {
  email_send: {
    registryName: "email_send",
    secretName: "RESEND_API_KEY",
    buildFlow(toolInput) {
      return {
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
              label: "Email",
              config: {
                tool_name: "email_send",
                tool_input: toolInput,
              },
            },
          },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "tool_1" }],
      };
    },
    defaultToolInput: {
      to: "delivered@resend.dev",
      subject: "T19 smoke gateway + tenant_secrets",
      text: "Smoke test from smoke-gateway-tenant-secrets-e2e.mjs",
      from: "onboarding@resend.dev",
    },
    secretValue:
      process.env.SMOKE_RESEND_API_KEY ??
      process.env.RESEND_API_KEY ??
      "re_smoke_fake_key_for_t19",
    assertExecution(output) {
      if (output.error?.includes("not found in registry")) {
        throw new Error(`registry miss: ${output.error}`);
      }
      if (output.error?.includes("requires RESEND_API_KEY in tenant_secrets")) {
        throw new Error(`tenant_secrets não injetado: ${output.error}`);
      }
      if (output.status === "success") return "success";
      if (output.error?.includes("Resend error")) return "resend_reached";
      throw new Error(`execução inesperada: ${output.error ?? "sem erro"}`);
    },
  },
  web_scrape: {
    registryName: "web_scrape",
    secretName: null,
    buildFlow(toolInput) {
      return {
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
              label: "Web Scrape",
              config: {
                tool_name: "web_scrape",
                tool_input: toolInput,
              },
            },
          },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "tool_1" }],
      };
    },
    defaultToolInput: {
      url: "https://example.com",
      provider: "auto",
    },
    secretValue: null,
    assertExecution(output) {
      if (output.error?.includes("not found in registry")) {
        throw new Error(`registry miss: ${output.error}`);
      }
      if (output.error?.includes("Unauthorized") || output.error?.includes("web-research-tools")) {
        throw new Error(`auth interna quebrada: ${output.error}`);
      }
      if (output.status === "success" && output.result?.content) return "content_ok";
      if (output.status === "success") return "success";
      throw new Error(`execução inesperada: ${output.error ?? "sem erro"}`);
    },
  },
  http_request: {
    registryName: "http_request",
    secretName: null,
    buildFlow(toolInput) {
      return {
        nodes: [
          { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Trigger" } },
          {
            id: "tool_1",
            type: "tool",
            position: { x: 300, y: 0 },
            data: {
              label: "HTTP",
              config: { tool_name: "http_request", tool_input: toolInput },
            },
          },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "tool_1" }],
      };
    },
    defaultToolInput: { url: "https://example.com", method: "GET" },
    secretValue: null,
    assertExecution(output) {
      if (output.error?.includes("not found in registry")) throw new Error(`registry miss: ${output.error}`);
      if (output.status === "success") return "success";
      throw new Error(`execução inesperada: ${output.error ?? "sem erro"}`);
    },
  },
  web_research: {
    registryName: "web_research",
    secretName: null,
    buildFlow(toolInput) {
      return {
        nodes: [
          { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Trigger" } },
          {
            id: "tool_1",
            type: "tool",
            position: { x: 300, y: 0 },
            data: {
              label: "Research",
              config: { tool_name: "web_research", tool_input: toolInput },
            },
          },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "tool_1" }],
      };
    },
    defaultToolInput: { query: "open source AI agents", limit: 3 },
    secretValue: null,
    assertExecution(output) {
      if (output.error?.includes("not found in registry")) throw new Error(`registry miss: ${output.error}`);
      if (output.error?.includes("Unauthorized")) throw new Error(`auth interna: ${output.error}`);
      if (output.status === "success" && output.result?.results) return "results_ok";
      if (output.status === "success") return "success";
      throw new Error(`execução inesperada: ${output.error ?? "sem erro"}`);
    },
  },
  condition_eval: {
    registryName: "condition_eval",
    secretName: null,
    buildFlow(toolInput) {
      return {
        nodes: [
          { id: "trigger_1", type: "trigger", position: { x: 0, y: 0 }, data: { label: "Trigger" } },
          {
            id: "tool_1",
            type: "tool",
            position: { x: 300, y: 0 },
            data: {
              label: "Condition",
              config: { tool_name: "condition_eval", tool_input: toolInput },
            },
          },
        ],
        edges: [{ id: "e1", source: "trigger_1", target: "tool_1" }],
      };
    },
    defaultToolInput: { expression: "true", variables: {} },
    secretValue: null,
    assertExecution(output) {
      if (output.error?.includes("not found in registry")) throw new Error(`registry miss: ${output.error}`);
      if (output.status === "success" && output.result?.result === true) return "bool_true";
      if (output.status === "success") return "success";
      throw new Error(`execução inesperada: ${output.error ?? "sem erro"}`);
    },
  },
};

const SMOKE_MATRIX = ["web_scrape", "http_request", "web_research", "condition_eval", "email_send"];

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

async function resolveUserId() {
  if (userIdArg) return userIdArg;
  const flows = await rest("agent_flows?select=user_id&limit=1").then((r) => r.json());
  if (flows?.[0]?.user_id) return flows[0].user_id;
  const projects = await rest("projects?select=owner_id&limit=1").then((r) => r.json());
  return projects?.[0]?.owner_id ?? null;
}

async function ensureRegistryHit(name) {
  const rows = await rest(
    `tool_registry?name=eq.${name}&select=name,is_active,required_secrets`,
  ).then((r) => r.json());

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`tool_registry miss: '${name}' não encontrado`);
  }
  if (!rows[0].is_active) {
    throw new Error(`tool_registry: '${name}' inativo`);
  }
  return rows[0];
}

async function ensureSmokeFlow(userId, spec) {
  if (flowIdArg) return flowIdArg;

  const existing = await rest(
    `agent_flows?user_id=eq.${userId}&name=eq.Smoke%20T19%20${spec.registryName}&select=id&limit=1`,
  ).then((r) => r.json());

  const flowDef = spec.buildFlow(spec.defaultToolInput);

  if (existing?.[0]?.id) {
    await rest(`agent_flows?id=eq.${existing[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({ flow_definition: flowDef, updated_at: new Date().toISOString() }),
    });
    return existing[0].id;
  }

  const createRes = await rest("agent_flows", {
    method: "POST",
    body: JSON.stringify({
      name: `Smoke T19 ${spec.registryName}`,
      description: "Auto-created by smoke-gateway-tenant-secrets-e2e",
      user_id: userId,
      status: "draft",
      flow_definition: flowDef,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Falha ao criar flow: ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created[0].id;
}

async function upsertTenantSecret(flowId, secretName, secretValue, userId) {
  await rest(
    `tenant_secrets?tenant_id=eq.${flowId}&secret_name=eq.${secretName}`,
    { method: "DELETE" },
  );

  const encoded = Buffer.from(secretValue, "utf8").toString("base64");
  const insertRes = await rest("tenant_secrets", {
    method: "POST",
    body: JSON.stringify({
      tenant_id: flowId,
      secret_name: secretName,
      encrypted_value: encoded,
      encryption_key_id: "smoke-test",
      secret_type: "api_key",
      is_platform_provided: false,
      created_by: userId,
    }),
  });

  if (!insertRes.ok) {
    throw new Error(`Falha ao gravar tenant_secret: ${await insertRes.text()}`);
  }

  const verify = await rest(
    `tenant_secrets?tenant_id=eq.${flowId}&secret_name=eq.${secretName}&select=secret_name`,
  ).then((r) => r.json());

  if (!verify?.length) {
    throw new Error("tenant_secret não persistido após insert");
  }
}

async function runGatewayTest(flowId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/aetherforge-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY || SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "test",
      flow_id: flowId,
      message: "T19 smoke — gateway tool + tenant_secrets",
      session_id: crypto.randomUUID(),
      channel: "test",
    }),
    signal: controller.signal,
  });
  clearTimeout(timer);

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`gateway HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function runSmokeForTool(name, userId) {
  const spec = TOOL_FLOWS[name];
  if (!spec) throw new Error(`Tool não suportada no smoke: ${name}`);

  console.log(`\n→ Smoke tool: ${name}`);

  const registry = await ensureRegistryHit(spec.registryName);
  console.log(`  ✓ tool_registry: ${registry.name} (secrets=${(registry.required_secrets || []).join(",") || "none"})`);

  const flowId = await ensureSmokeFlow(userId, spec);
  console.log(`  ✓ agent_flow: ${flowId}`);

  if (spec.secretName && spec.secretValue) {
    await upsertTenantSecret(flowId, spec.secretName, spec.secretValue, userId);
    console.log(`  ✓ tenant_secrets: ${spec.secretName} → flowId`);
  } else {
    console.log("  ✓ tenant_secrets: não necessário para esta tool");
  }

  const gw = await runGatewayTest(flowId);
  const toolStep = gw.steps?.find((s) => s.node_type === "tool");

  if (!toolStep?.output) {
    throw new Error(`gateway sem step de tool: ${JSON.stringify(gw.steps)}`);
  }

  const outcome = spec.assertExecution(toolStep.output);
  console.log(
    `  ✓ tool executado: ${toolStep.output.tool_name} (${toolStep.output.status}, ${outcome})`,
  );

  if (toolStep.output.error) {
    console.log(`    detail: ${toolStep.output.error.slice(0, 160)}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("✗ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios (.env.local)");
    process.exit(1);
  }

  const tools = toolName === "all" ? SMOKE_MATRIX : [toolName];
  for (const name of tools) {
    if (!TOOL_FLOWS[name]) {
      console.error(`✗ Tool não suportada no smoke: ${name}`);
      process.exit(1);
    }
  }

  console.log("→ Smoke gateway + tenant_secrets (T19/T29)");

  const userId = await resolveUserId();
  if (!userId) {
    console.error("✗ Nenhum user_id — passe --user-id=");
    process.exit(1);
  }

  const failures = [];
  for (const name of tools) {
    try {
      await runSmokeForTool(name, userId);
    } catch (err) {
      failures.push({ name, error: err.message || String(err) });
      console.error(`  ✗ ${name}: ${err.message || err}`);
    }
  }

  if (failures.length) {
    console.error(`\n✗ ${failures.length}/${tools.length} tools falharam`);
    process.exit(1);
  }

  console.log(`\n✓ Smoke passou — ${tools.length} tool(s)`);
}

main().catch((err) => {
  console.error("✗", err.message || err);
  process.exit(1);
});