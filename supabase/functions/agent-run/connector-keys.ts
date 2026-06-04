import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Carrega chaves LLM salvas na tabela connectors (service role). */
export async function loadConnectorKeys(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("connectors")
    .select("kind, token_encrypted, meta")
    .eq("owner_id", ownerId)
    .not("token_encrypted", "is", null);

  if (error) throw new Error(`Falha ao carregar conectores: ${error.message}`);

  const keys: Record<string, string> = {};
  for (const row of data ?? []) {
    const token = row.token_encrypted?.trim();
    if (!token) continue;
    const meta = (row.meta ?? {}) as Record<string, string>;

    if (row.kind === "anthropic") keys.ANTHROPIC_API_KEY = token;
    if (row.kind === "openai") {
      const p = meta.provider ?? "openai";
      if (p === "groq") keys.GROQ_API_KEY = token;
      else if (p === "xai") keys.XAI_API_KEY = token;
      else keys.OPENAI_API_KEY = token;
    }
  }
  return keys;
}