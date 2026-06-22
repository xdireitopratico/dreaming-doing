#!/usr/bin/env node
/**
 * Valida cada provider LLM conectado via curl idêntico ao chat (postAgentRun).
 * SSOT: agent_preferences no DB — o body.preferences é ignorado pelo runtime.
 *
 *   node scripts/validate-providers-chat-curl.mjs
 *   node scripts/validate-providers-chat-curl.mjs --provider=groq
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/load-env-local.mjs";

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "";

let PROJECT_ID = process.env.VALIDATE_PROJECT_ID ?? "";
let CONVERSATION_ID = process.env.VALIDATE_CONVERSATION_ID ?? "";

/** Primeiro preset fixo por env (sync model-catalog ENV_DISPLAY_ORDER). */
const FIXED_PRESET_BY_PROVIDER = {
  anthropic: "anthropic--claude-sonnet-4-6",
  groq: "pool-groq-flash",
  nvidia: "nvidia--nemotron-3-ultra-550b",
  openai: "openai--gpt-5-4",
  gemini: "google--gemini-3-5-flash",
  xai: "xai--grok-4-3",
  deepseek: "deepseek--deepseek-v3",
  alibaba: "qwen--qwen3-6-flash",
  moonshotai: "moonshotai--kimi-k2-5",
  minimax: "minimax--minimax-m2-5",
  openrouter: "zhipu--glm-5",
  xiaomi: "xiaomi--mimo-v2-5-pro",
  ollama: "ollama--llama3-2",
};

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : null;
}

function loadCreds() {
  if (process.env.VALIDATE_EMAIL && process.env.VALIDATE_PASSWORD) {
    return { email: process.env.VALIDATE_EMAIL, password: process.env.VALIDATE_PASSWORD };
  }
  try {
    const raw = readFileSync(resolve(process.cwd(), ".e2e/credentials.json"), "utf8");
    const p = JSON.parse(raw);
    if (p.email && p.password) return { email: p.email, password: p.password, userId: p.userId };
  } catch {
    /* */
  }
  throw new Error("Defina VALIDATE_EMAIL/VALIDATE_PASSWORD ou .e2e/credentials.json");
}

function restHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
    ...extra,
  };
}

function classifyResult(status, bodyText) {
  const lower = bodyText.toLowerCase();
  if (status === 200) {
    try {
      const j = JSON.parse(bodyText);
      if (j.ok && j.content) return { ok: true, kind: "reply", snippet: String(j.content).slice(0, 120) };
    } catch {
      /* */
    }
    return { ok: true, kind: "http200", snippet: bodyText.slice(0, 120) };
  }
  if (/\b(401|403)\b/.test(bodyText) || /unauthorized|invalid.*key|api key/i.test(lower)) {
    return { ok: false, kind: "auth", snippet: bodyText.slice(0, 200) };
  }
  if (
    /\b402\b/.test(bodyText) ||
    /payment|credit|quota|insufficient|unavailable for free|paid version/i.test(lower)
  ) {
    return { ok: true, kind: "credit", snippet: bodyText.slice(0, 200) };
  }
  if (/\b404\b/.test(bodyText) && /model/i.test(lower)) {
    return { ok: false, kind: "model_404", snippet: bodyText.slice(0, 200) };
  }
  if (/\b429\b/.test(bodyText) || /rate limit|limite por minuto/i.test(lower)) {
    return { ok: true, kind: "rate_limit", snippet: bodyText.slice(0, 200) };
  }
  if (status === 400 && /setup/i.test(lower)) {
    return { ok: false, kind: "setup", snippet: bodyText.slice(0, 200) };
  }
  return { ok: false, kind: `http_${status}`, snippet: bodyText.slice(0, 200) };
}

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`signIn: ${error?.message ?? "sem sessão"}`);
  }
  return { token: data.session.access_token, userId: data.session.user.id };
}

async function listConnectedProviders(userId) {
  const url = `${SUPABASE_URL}/rest/v1/connectors?owner_id=eq.${userId}&token_encrypted=not.is.null&select=kind,provider,meta`;
  const res = await fetch(url, { headers: restHeaders(SERVICE_KEY) });
  const rows = await res.json();
  if (!res.ok) throw new Error(`connectors: ${JSON.stringify(rows).slice(0, 200)}`);

  const out = new Set();
  for (const row of rows ?? []) {
    if (row.kind === "anthropic") {
      out.add("anthropic");
      continue;
    }
    if (row.kind === "openai") {
      const p = (row.provider ?? row.meta?.provider ?? "openai").trim();
      if (p) out.add(p);
    }
  }
  return [...out].sort();
}

const OPENROUTER_VALIDATE_MODEL =
  process.env.OPENROUTER_VALIDATE_MODEL ?? "nex-agi/nex-n2-pro:free";

async function setFixedPreferences(userId, providerId) {
  let prefs;
  if (providerId === "openrouter") {
    prefs = {
      mode: "fixed",
      useCustomModel: true,
      customModelId: OPENROUTER_VALIDATE_MODEL,
      userModelEntries: [
        {
          slug: OPENROUTER_VALIDATE_MODEL,
          env: "openrouter",
          label: "validate openrouter",
        },
      ],
    };
  } else {
    const preset = FIXED_PRESET_BY_PROVIDER[providerId];
    if (!preset) {
      if (providerId.startsWith("custom-")) {
        return { mode: "fixed", fixedPresetId: preset, skipped: "custom_sem_preset_fixo" };
      }
      throw new Error(`Sem preset fixo mapeado para provider=${providerId}`);
    }
    prefs = { mode: "fixed", fixedPresetId: preset };
  }
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: restHeaders(SERVICE_KEY),
    body: JSON.stringify({ agent_preferences: prefs }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PATCH profiles: ${t.slice(0, 200)}`);
  }
  return prefs;
}

/** Mesmo contrato que src/hooks/agent-run/agent-run-connect.ts postAgentRun */
async function curlChatOi(accessToken, providerId) {
  const url = `${SUPABASE_URL}/functions/v1/agent-run`;
  const body = {
    projectId: PROJECT_ID,
    conversationId: CONVERSATION_ID,
    mode: "chat",
    message: "oi",
    sessionKind: "byok",
    preferences: { mode: "fixed", fixedPresetId: FIXED_PRESET_BY_PROVIDER[providerId] },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, classified: classifyResult(res.status, text) };
}

async function resolveProjectAndConversation(userId) {
  if (PROJECT_ID && CONVERSATION_ID) return { projectId: PROJECT_ID, conversationId: CONVERSATION_ID };

  const projUrl = `${SUPABASE_URL}/rest/v1/projects?owner_id=eq.${userId}&select=id&order=created_at.desc&limit=1`;
  const projRes = await fetch(projUrl, { headers: restHeaders(SERVICE_KEY) });
  const projects = await projRes.json();
  if (!projRes.ok || !projects?.[0]?.id) {
    throw new Error("Usuário sem projeto — crie um projeto no editor antes de validar.");
  }
  const projectId = projects[0].id;

  const convUrl = `${SUPABASE_URL}/rest/v1/conversations?project_id=eq.${projectId}&select=id&order=created_at.desc&limit=1`;
  const convRes = await fetch(convUrl, { headers: restHeaders(SERVICE_KEY) });
  const convs = await convRes.json();
  let conversationId = convs?.[0]?.id;
  if (!conversationId) {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: "POST",
      headers: restHeaders(SERVICE_KEY, { Prefer: "return=representation" }),
      body: JSON.stringify({ project_id: projectId, title: "[validate] providers curl" }),
    });
    const created = await ins.json();
    if (!ins.ok || !created?.[0]?.id) {
      throw new Error(`Falha ao criar conversation: ${JSON.stringify(created).slice(0, 200)}`);
    }
    conversationId = created[0].id;
  }
  return { projectId, conversationId };
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    throw new Error("SUPABASE_URL, SERVICE_ROLE e ANON key obrigatórios (.env.local)");
  }

  const creds = loadCreds();
  const { token, userId } = await signIn(creds.email, creds.password);
  const uid = creds.userId ?? userId;

  const resolved = await resolveProjectAndConversation(uid);
  PROJECT_ID = resolved.projectId;
  CONVERSATION_ID = resolved.conversationId;

  let providers = await listConnectedProviders(uid);
  const only = arg("provider");
  if (only) providers = providers.filter((p) => p === only);

  if (providers.length === 0) {
    console.log("Nenhum provider com chave em connectors.");
    process.exit(1);
  }

  console.log(`\n═══ validate-providers-chat-curl (${providers.length} providers) ═══`);
  console.log(`user=${uid.slice(0, 8)}… project=${PROJECT_ID.slice(0, 8)}…\n`);

  const results = [];
  for (const providerId of providers) {
    if (!FIXED_PRESET_BY_PROVIDER[providerId] && !providerId.startsWith("custom-")) {
      results.push({ providerId, skip: true, reason: "sem preset no mapa" });
      console.log(`⊘ ${providerId.padEnd(14)} SKIP — sem preset fixo mapeado`);
      continue;
    }
    if (providerId.startsWith("custom-")) {
      results.push({ providerId, skip: true, reason: "custom requer userModelEntries" });
      console.log(`⊘ ${providerId.padEnd(14)} SKIP — custom precisa modelo cadastrado`);
      continue;
    }

    process.stdout.write(`→ ${providerId.padEnd(14)} `);
    try {
      const prefs = await setFixedPreferences(uid, providerId);
      const { status, classified } = await curlChatOi(token, providerId);
      const icon = classified.ok ? "✓" : "✗";
      console.log(
        `${icon} HTTP ${status} [${classified.kind}] preset=${prefs.fixedPresetId} — ${classified.snippet.replace(/\s+/g, " ").trim()}`,
      );
      results.push({ providerId, status, ...classified, preset: prefs.fixedPresetId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✗ ERRO — ${msg}`);
      results.push({ providerId, ok: false, kind: "script_error", snippet: msg });
    }
  }

  const failed = results.filter((r) => !r.skip && !r.ok);
  const passed = results.filter((r) => !r.skip && r.ok);
  const byKind = Object.groupBy(passed, (r) => r.kind ?? "unknown");
  console.log(
    `\n─── ${passed.length} OK · ${failed.length} falha · ${results.filter((r) => r.skip).length} skip ───`,
  );
  if (passed.length) {
    console.log(
      "tipos OK:",
      Object.entries(byKind)
        .map(([k, v]) => `${k}=${v.length}`)
        .join(", "),
    );
  }
  console.log(
    "\nPara testar TODOS os providers: VALIDATE_EMAIL=seu@email VALIDATE_PASSWORD=*** node scripts/validate-providers-chat-curl.mjs\n",
  );

  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});