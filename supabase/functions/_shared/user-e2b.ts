import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Chave E2B do usuário (connectors.kind = e2b) — sem fallback global. */
export async function loadUserE2bApiKey(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("connectors")
    .select("token_encrypted")
    .eq("owner_id", ownerId)
    .eq("kind", "e2b")
    .eq("provider", "")
    .maybeSingle();

  if (error) {
    console.error("[user-e2b]", error.message);
    return null;
  }
  const t = data?.token_encrypted?.trim();
  return t && t.length > 8 ? t : null;
}

export const E2B_SETUP_USER_MESSAGE =
  "Sandbox E2B não configurado. Cole sua chave API da E2B em Conectores → Sandbox (E2B) — o preview e o agente só rodam com a sua conta.";