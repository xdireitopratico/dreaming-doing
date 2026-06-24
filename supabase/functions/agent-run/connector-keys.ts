import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { FORGE_ADMIN_EMAIL } from "../_shared/forge-admin.ts";
import { applyOpenAiConnectorToken } from "../_shared/provider-wire.ts";
import { enrichConnectorKeysWithCustomProviders } from "./custom-providers-db.ts";

export type AgentPreferencesPayload = {
  mode?: "auto" | "robin" | "rob" | "fixed";
  poolProvider?: string;
  fixedPresetId?: string;
  robinPoolModelId?: string;
  /** ID exato do modelo na API (ex.: anthropic/claude-sonnet-4-6, openrouter slug) */
  customModelId?: string;
  useCustomModel?: boolean;
  parserProvider?: string;
  webSearchProvider?: string;
  webScrapeProvider?: string;
  browserRuntimeProvider?: string;
  autoAllowedPresetIds?: string[];
  userModelEntries?: { slug: string; env: string; label?: string }[];
  // Tools fallback chain — primary é o provider conectado, fallback é o segundo.
  webSearchFallback?: string;
  webScrapeFallback?: string;
  browserFallback?: string;
};

function isRobinMode(preferences?: AgentPreferencesPayload): boolean {
  return preferences?.mode === "robin" || preferences?.mode === "rob";
}

export function parseTokenField(tokenField: string | null): string[] {
  if (!tokenField?.trim()) return [];
  const t = tokenField.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x.length > 0);
    } catch {
      /* single token */
    }
  }
  return [t];
}

function openAiProvider(row: { provider?: string | null; meta?: unknown }): string {
  const col = row.provider?.trim();
  if (col) return col;
  const meta = (row.meta ?? {}) as Record<string, string>;
  return meta.provider ?? "openai";
}

/** Pools completos para modo ROBIN (todas as chaves do provedor selecionado). */
export async function loadConnectorPools(
  supabase: SupabaseClient,
  ownerId: string,
  poolProvider: string = "groq",
): Promise<string[]> {
  const { data, error } = await supabase
    .from("connectors")
    .select("token_encrypted")
    .eq("owner_id", ownerId)
    .eq("kind", "openai")
    .eq("provider", poolProvider)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar pool: ${error.message}`);
  const pool = parseTokenField(data?.token_encrypted ?? null);
  if (pool.length > 0) return pool;

  // Chave salva com «Salvar chave» (token único) — reutiliza como pool de 1
  const keys = await loadConnectorKeys(supabase, ownerId);
  const fallback = keys[`${poolProvider.toUpperCase()}_API_KEY`] ?? keys.GROQ_API_KEY;
  return fallback ? [fallback] : [];
}

/** ID do usuário administrador FORGE (pool ROBIN do tira-gosto). */
export async function resolveForgeAdminUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 500, page: 1 });
  if (error) {
    console.error("resolveForgeAdminUserId:", error.message);
    return null;
  }
  const u = data.users.find(
    (x) => x.email?.trim().toLowerCase() === FORGE_ADMIN_EMAIL.toLowerCase(),
  );
  return u?.id ?? null;
}

/** Pool ROBIN NVIDIA do administrador — salvo em API Keys (/api), sem vault global. */
export async function loadForgeTrialRobinPool(supabase: SupabaseClient): Promise<string[]> {
  const adminId = await resolveForgeAdminUserId(supabase);
  if (!adminId) return [];
  return loadConnectorPools(supabase, adminId, "nvidia");
}

/** Chaves por provedor — Groq, NVIDIA, xAI e OpenAI podem coexistir. */
export async function loadConnectorKeys(
  supabase: SupabaseClient,
  ownerId: string,
  preferences?: AgentPreferencesPayload,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("connectors")
    .select("kind, token_encrypted, meta, provider")
    .eq("owner_id", ownerId)
    .not("token_encrypted", "is", null);

  if (error) throw new Error(`Falha ao carregar conectores: ${error.message}`);

  const keys: Record<string, string> = {};
  const robinMode = isRobinMode(preferences);
  const poolProvider = preferences?.poolProvider ?? "groq";

  for (const row of data ?? []) {
    const tokens = parseTokenField(row.token_encrypted);
    const token = tokens[0];
    if (!token) continue;

    if (row.kind === "anthropic") {
      keys.ANTHROPIC_API_KEY = token;
      continue;
    }

    if (row.kind === "openai") {
      const p = openAiProvider(row);
      if (robinMode && p !== poolProvider) continue;

      const meta = (row.meta ?? {}) as { baseUrl?: string; defaultModel?: string };
      Object.assign(keys, applyOpenAiConnectorToken(p, token, meta));
    }
  }
  return enrichConnectorKeysWithCustomProviders(supabase, ownerId, keys);
}

const DEPLOY_KIND_TO_KEY: Record<string, string> = {
  vercel: "VERCEL_TOKEN",
  netlify: "NETLIFY_TOKEN",
  cloudflare: "CLOUDFLARE_API_TOKEN",
  github: "GITHUB_TOKEN",
};

/** Tokens de deploy (Vercel, Netlify, etc.) para o agente escolher stack. */
export async function loadDeployConnectorKeys(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("connectors")
    .select("kind, token_encrypted")
    .eq("owner_id", ownerId)
    .in("kind", ["vercel", "netlify", "cloudflare", "github"]);

  if (error) return {};

  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    const keyName = DEPLOY_KIND_TO_KEY[row.kind];
    if (!keyName) continue;
    const tokens = parseTokenField(row.token_encrypted);
    if (tokens[0]) out[keyName] = tokens[0];
  }
  return out;
}
