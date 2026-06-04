import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AgentPreferencesPayload = {
  mode?: "auto" | "rob" | "fixed";
  poolProvider?: "nvidia" | "groq";
  fixedPresetId?: string;
};

function parseTokenField(tokenField: string | null): string[] {
  if (!tokenField?.trim()) return [];
  const t = tokenField.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x.length > 0);
    } catch { /* fallthrough */ }
  }
  return [t];
}

function pickToken(tokens: string[], mode?: string): string {
  if (tokens.length === 0) return "";
  if (mode === "rob" && tokens.length > 1) {
    return tokens[Math.floor(Math.random() * tokens.length)]!;
  }
  return tokens[0]!;
}

/** Carrega chaves LLM salvas na tabela connectors (service role). */
export async function loadConnectorKeys(
  supabase: SupabaseClient,
  ownerId: string,
  preferences?: AgentPreferencesPayload,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("connectors")
    .select("kind, token_encrypted, meta")
    .eq("owner_id", ownerId)
    .not("token_encrypted", "is", null);

  if (error) throw new Error(`Falha ao carregar conectores: ${error.message}`);

  const keys: Record<string, string> = {};
  const robMode = preferences?.mode === "rob";
  const poolProvider = preferences?.poolProvider ?? "groq";

  for (const row of data ?? []) {
    const meta = (row.meta ?? {}) as Record<string, string>;
    const tokens = parseTokenField(row.token_encrypted);
    const token = pickToken(tokens, robMode ? "rob" : undefined);
    if (!token) continue;

    if (row.kind === "anthropic") {
      keys.ANTHROPIC_API_KEY = token;
      continue;
    }

    if (row.kind === "openai") {
      const p = meta.provider ?? "openai";
      if (robMode && p !== poolProvider) continue;

      if (p === "groq") keys.GROQ_API_KEY = token;
      else if (p === "xai") keys.XAI_API_KEY = token;
      else if (p === "nvidia") keys.NVIDIA_API_KEY = token;
      else keys.OPENAI_API_KEY = token;
    }
  }
  return keys;
}