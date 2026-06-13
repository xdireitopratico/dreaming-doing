#!/usr/bin/env node
/**
 * E2E smoke: Prometheus motor — research_web/fetch_page backends + cortex turn.
 *
 * Validates:
 *   1. firecrawl-search (research_web backend)
 *   2. firecrawl-scrape (fetch_page backend)
 *   3. prometheus-builder action=start with user JWT → ≥1 cortex turn
 *
 * Usage:
 *   node scripts/smoke-prometheus-e2e.mjs
 *   node scripts/smoke-prometheus-e2e.mjs --model-id=google/gemini-2.5-flash
 *   node scripts/smoke-prometheus-e2e.mjs --with-gateway   # also runs smoke-aetherforge-e2e
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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

const modelId = arg("model-id", "google/gemini-2.5-flash");
const userIdArg = arg("user-id", process.env.SMOKE_USER_ID ?? "");
const flowIdArg = arg("flow-id", "");
const pollTimeoutMs = Number(arg("timeout-ms", "90000"));
const pollIntervalMs = 2000;
const withGateway = process.argv.includes("--with-gateway");

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

async function resolveFlowId(userId) {
  if (flowIdArg) return flowIdArg;
  const flows = await rest(
    `agent_flows?user_id=eq.${userId}&select=id&order=updated_at.desc&limit=1`,
  ).then((r) => r.json());
  return flows?.[0]?.id ?? null;
}

async function getUserJwt(userId) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);
  if (userErr || !userData?.user?.email) {
    throw new Error(`Não foi possível obter email do usuário: ${userErr?.message ?? "missing"}`);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error(`generateLink falhou: ${linkErr?.message ?? "no token"}`);
  }

  const { data: otpData, error: otpErr } = await client.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (otpErr || !otpData?.session?.access_token) {
    throw new Error(`verifyOtp falhou: ${otpErr?.message ?? "no session"}`);
  }

  return otpData.session.access_token;
}

async function callEdgeFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: ANON_KEY || SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function smokeResearchWeb() {
  console.log("→ research_web (firecrawl-search)");
  const { status, body } = await callEdgeFunction("firecrawl-search", {
    query: "AI sales agent whatsapp",
    options: { limit: 2 },
  });

  if (status === 404) {
    throw new Error("firecrawl-search não deployada (404)");
  }
  if (typeof body !== "object" || body === null) {
    throw new Error(`firecrawl-search resposta inválida: ${status}`);
  }

  if (body.success === true && (body.data || body.results)) {
    console.log("  ✓ research_web OK (resultados retornados)");
    return { ok: true, configured: true };
  }

  const err = body.error || "unknown";
  if (String(err).includes("not configured")) {
    console.log("  ⚠ research_web: Firecrawl não configurado (adicione FIRECRAWL_API_KEY em /api)");
    return { ok: true, configured: false, warn: err };
  }

  console.log(`  ⚠ research_web degradou: ${err}`);
  return { ok: true, configured: false, warn: err };
}

async function smokeFetchPage() {
  console.log("→ fetch_page (firecrawl-scrape)");
  const { status, body } = await callEdgeFunction("firecrawl-scrape", {
    url: "https://example.com",
    options: { formats: ["markdown"], onlyMainContent: true },
  });

  if (status === 404) {
    throw new Error("firecrawl-scrape não deployada (404)");
  }
  if (typeof body !== "object" || body === null) {
    throw new Error(`firecrawl-scrape resposta inválida: ${status}`);
  }

  if (body.success === true) {
    console.log("  ✓ fetch_page OK (página raspada)");
    return { ok: true, configured: true };
  }

  const err = body.error || "unknown";
  if (String(err).includes("not configured")) {
    console.log("  ⚠ fetch_page: Firecrawl não configurado (adicione FIRECRAWL_API_KEY em /api)");
    return { ok: true, configured: false, warn: err };
  }

  console.log(`  ⚠ fetch_page degradou: ${err}`);
  return { ok: true, configured: false, warn: err };
}

async function smokeCortexStart(userJwt, userId, flowId) {
  console.log("→ prometheus-builder start (user JWT)");
  const prompt =
    "agente prospect para vender plataforma SaaS para advogados";

  const res = await fetch(`${SUPABASE_URL}/functions/v1/prometheus-builder`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userJwt}`,
      apikey: ANON_KEY || SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "start",
      flow_id: flowId,
      model_id: modelId,
      briefing: {
        prompt,
        quality_model: modelId,
      },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.session_id) {
    throw new Error(`prometheus-builder start falhou (${res.status}): ${JSON.stringify(body)}`);
  }

  const sessionId = body.session_id;
  console.log(`  ✓ sessão criada: ${sessionId}`);

  console.log("→ aguardando turno cortex…");
  const deadline = Date.now() + pollTimeoutMs;
  let cortexTurns = 0;
  let phase = "discovery";

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    const turns = await rest(
      `prometheus_build_turns?session_id=eq.${sessionId}&select=agent_key,phase,content,created_at&order=created_at.asc`,
    ).then((r) => r.json());

    if (!Array.isArray(turns)) {
      throw new Error(`prometheus_build_turns query falhou: ${JSON.stringify(turns)}`);
    }

    cortexTurns = turns.filter((t) => t.agent_key === "cortex").length;

    const sessions = await rest(
      `prometheus_build_sessions?id=eq.${sessionId}&select=phase`,
    ).then((r) => r.json());
    phase = sessions?.[0]?.phase ?? phase;

    const agentKeys = new Set(turns.map((t) => t.agent_key));
    const stupidFork = turns.some((t) =>
      typeof t.content === "string" &&
      (/Em quais canais o agente/i.test(t.content) ||
        /Qual tom de comunicação/i.test(t.content) ||
        /ferramentas externas/i.test(t.content)),
    );

    if (cortexTurns >= 1 && agentKeys.size >= 3 && !stupidFork) {
      console.log(`  ✓ boardroom OK (agents=${agentKeys.size}, cortex=${cortexTurns}, phase=${phase})`);
      return { sessionId, cortexTurns, phase, agentKeys: [...agentKeys] };
    }
  }

  throw new Error(
    `Timeout: nenhum turno cortex após ${pollTimeoutMs}ms (phase=${phase})`,
  );
}

function runGatewaySmoke() {
  return new Promise((resolvePromise, reject) => {
    console.log("→ Smoke AetherForge gateway (action=test)");
    const child = spawn("node", ["scripts/smoke-aetherforge-e2e.mjs"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`smoke-aetherforge-e2e exit ${code}`));
    });
  });
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    console.error("✗ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY são obrigatórios (.env.local)");
    process.exit(1);
  }

  console.log("→ Smoke Prometheus e2e");

  if (withGateway) {
    await runGatewaySmoke();
  }

  const userId = await resolveUserId();
  if (!userId) {
    console.error("✗ Nenhum user_id — passe --user-id= ou crie um agent_flow");
    process.exit(1);
  }

  const flowId = await resolveFlowId(userId);
  if (!flowId) {
    console.error("✗ Nenhum agent_flow — passe --flow-id= ou crie um projeto agente");
    process.exit(1);
  }

  console.log(`  user: ${userId}`);
  console.log(`  flow: ${flowId}`);
  console.log(`  model: ${modelId}`);

  const research = await smokeResearchWeb();
  const fetch = await smokeFetchPage();

  const userJwt = await getUserJwt(userId);
  const cortex = await smokeCortexStart(userJwt, userId, flowId);

  const firecrawlNote =
    !research.configured || !fetch.configured
      ? " (Firecrawl: configure FIRECRAWL_API_KEY em /api para pesquisa real)"
      : "";

  console.log(
    `✓ Smoke Prometheus passou — cortex=${cortex.cortexTurns}, phase=${cortex.phase}${firecrawlNote}`,
  );
}

main().catch((err) => {
  console.error("✗", err.message || err);
  process.exit(1);
});