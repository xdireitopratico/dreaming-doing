/**
 * Seed isolado para usuário E2E dedicado.
 * Não usa localStorage, não copia chave do admin e não toca perfil real por default.
 */
import { createClient } from "@supabase/supabase-js";

export const E2E_DEFAULT_MODEL = process.env.E2E_MODEL ?? "cohere/north-mini-code:free";

export const E2E_AGENT_PREFERENCES = {
  mode: process.env.E2E_MODE ?? "fixed",
  useCustomModel: true,
  customModelId: E2E_DEFAULT_MODEL,
  userModelEntries: [
    {
      slug: E2E_DEFAULT_MODEL,
      env: "openrouter",
      label: "E2E OpenRouter free",
    },
  ],
};

/** Chave OpenRouter — evita rate limit do pool Groq admin (compartilhado com smoke). */
export function resolveE2eOpenRouterKey(env = process.env) {
  return (env.OPENROUTER_API_KEY ?? env.E2E_OPENROUTER_KEY ?? "").trim();
}

export function hasDedicatedE2eLlmKey(env = process.env) {
  return Boolean(resolveE2eOpenRouterKey(env));
}

/** @deprecated use hasDedicatedE2eLlmKey */
export function hasDedicatedE2eGroqKey(env = process.env) {
  return hasDedicatedE2eLlmKey(env);
}

function parseTokenField(tokenField) {
  if (!tokenField?.trim()) return [];
  const t = tokenField.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x.length > 0);
    } catch {
      /* single token */
    }
  }
  return [t];
}

function restHeaders(serviceKey, extra = {}) {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

/** Só usuários provisionados para E2E podem receber patch em profiles.agent_preferences. */
export async function isDedicatedE2eUser(supabaseUrl, serviceKey, userId) {
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  const email = data.user.email?.trim().toLowerCase() ?? "";
  if (email.endsWith("@forge-e2e.local")) return true;
  if (data.user.user_metadata?.e2e === true) return true;
  return false;
}

async function fetchConnector(supabaseUrl, serviceKey, ownerId, kind, provider = "") {
  let url = `${supabaseUrl}/rest/v1/connectors?owner_id=eq.${ownerId}&kind=eq.${kind}&select=token_encrypted,meta,provider&limit=1`;
  if (provider) url += `&provider=eq.${provider}`;
  const res = await fetch(url, { headers: restHeaders(serviceKey) });
  const rows = await res.json();
  if (!res.ok) throw new Error(`fetchConnector(${kind}): ${JSON.stringify(rows).slice(0, 200)}`);
  return rows?.[0] ?? null;
}

async function upsertConnector(
  supabaseUrl,
  serviceKey,
  ownerId,
  { kind, provider = "", tokenEncrypted, meta = {}, forceUpdate = false },
) {
  const existing = await fetchConnector(supabaseUrl, serviceKey, ownerId, kind, provider);

  if (existing?.token_encrypted && !forceUpdate) {
    return { seeded: false, reason: `already_has_${kind}` };
  }

  if (existing?.token_encrypted && forceUpdate) {
    let patchUrl = `${supabaseUrl}/rest/v1/connectors?owner_id=eq.${ownerId}&kind=eq.${kind}`;
    if (provider) patchUrl += `&provider=eq.${provider}`;
    const res = await fetch(patchUrl, {
      method: "PATCH",
      headers: restHeaders(serviceKey),
      body: JSON.stringify({
        token_encrypted: tokenEncrypted,
        meta: { ...(existing.meta ?? {}), e2e: true, ...meta },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`upsertConnector patch(${kind}): ${res.status} ${t.slice(0, 200)}`);
    }
    return { seeded: true, reason: "updated" };
  }

  const body = {
    owner_id: ownerId,
    kind,
    provider,
    token_encrypted: tokenEncrypted,
    meta: { e2e: true, ...meta },
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/connectors`, {
    method: "POST",
    headers: restHeaders(serviceKey, {
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(
      `upsertConnector(${kind}): ${res.status} ${JSON.stringify(payload).slice(0, 200)}`,
    );
  }
  return { seeded: true, reason: "inserted" };
}

async function patchProfilePreferences(supabaseUrl, serviceKey, userId, preferences) {
  const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
    method: "PATCH",
    headers: restHeaders(serviceKey),
    body: JSON.stringify({ agent_preferences: preferences }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`patchProfilePreferences: ${res.status} ${t.slice(0, 200)}`);
  }
}

/**
 * Garante conectores BYOK (+ opcionalmente prefs) para usuário E2E.
 * @param {object} opts
 * @param {boolean} [opts.patchPreferences=false] — por default não grava agent_preferences
 */
export async function seedE2eAgentSetup({
  supabaseUrl,
  serviceKey,
  userId,
  patchPreferences = false,
}) {
  if (!supabaseUrl || !serviceKey || !userId) {
    throw new Error("seedE2eAgentSetup: supabaseUrl, serviceKey e userId obrigatórios");
  }

  const dedicated = await isDedicatedE2eUser(supabaseUrl, serviceKey, userId);
  if (!dedicated) {
    throw new Error(
      `seedE2eAgentSetup: usuário ${userId.slice(0, 8)} não é E2E dedicado; abortando seed.`,
    );
  }

  if (patchPreferences) {
    await patchProfilePreferences(supabaseUrl, serviceKey, userId, E2E_AGENT_PREFERENCES);
  }

  const envOr = resolveE2eOpenRouterKey();
  const orToken = envOr || null;
  const orSource = envOr
    ? process.env.OPENROUTER_API_KEY
      ? "OPENROUTER_API_KEY"
      : "E2E_OPENROUTER_KEY"
    : null;
  if (!orToken) {
    throw new Error(
      "seedE2eAgentSetup: sem chave OpenRouter dedicada — defina OPENROUTER_API_KEY ou E2E_OPENROUTER_KEY para o smoke.",
    );
  }

  const orConn = await upsertConnector(supabaseUrl, serviceKey, userId, {
    kind: "openai",
    provider: "openrouter",
    tokenEncrypted: orToken,
    meta: { provider: "openrouter", keySource: orSource, e2eModel: E2E_DEFAULT_MODEL },
    forceUpdate: Boolean(envOr),
  });

  const envE2b = (process.env.E2E_E2B_KEY ?? "").trim();
  const e2bToken = envE2b || null;
  const e2bSource = envE2b ? "E2E_E2B_KEY" : null;
  if (!e2bToken) {
    throw new Error("seedE2eAgentSetup: sem chave E2B dedicada — defina E2E_E2B_KEY para o smoke.");
  }

  const e2bConn = await upsertConnector(supabaseUrl, serviceKey, userId, {
    kind: "e2b",
    provider: "",
    tokenEncrypted: e2bToken,
    meta: { keySource: e2bSource, e2bHealthOk: true, e2e: true },
    forceUpdate: true,
  });

  return {
    preferences: E2E_AGENT_PREFERENCES,
    openrouter: orConn,
    e2b: e2bConn,
    openrouterSource: orSource,
    e2bSource,
    model: E2E_DEFAULT_MODEL,
  };
}
