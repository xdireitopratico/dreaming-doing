import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AgentPreferencesPayload = {
  mode?: "auto" | "robin" | "rob" | "fixed";
  poolProvider?: "nvidia" | "groq";
  fixedPresetId?: string;
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
    } catch { /* single token */ }
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
  poolProvider: "nvidia" | "groq" = "groq",
): Promise<string[]> {
  const { data, error } = await supabase
    .from("connectors")
    .select("token_encrypted")
    .eq("owner_id", ownerId)
    .eq("kind", "openai")
    .eq("provider", poolProvider)
    .maybeSingle();

  if (error) throw new Error(`Falha ao carregar pool: ${error.message}`);
  return parseTokenField(data?.token_encrypted ?? null);
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

      if (p === "groq") keys.GROQ_API_KEY = token;
      else if (p === "xai") keys.XAI_API_KEY = token;
      else if (p === "nvidia") keys.NVIDIA_API_KEY = token;
      else keys.OPENAI_API_KEY = token;
    }
  }
  return keys;
}