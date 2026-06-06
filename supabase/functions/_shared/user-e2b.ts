import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function parseE2bTokenField(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const first = parsed.find((x) => typeof x === "string" && x.trim().length > 8);
        if (typeof first === "string") return first.trim();
      }
    } catch {
      /* token único */
    }
  }

  return trimmed.length > 8 ? trimmed : null;
}

/** Chave E2B do usuário (connectors.kind = e2b) — sem fallback global. */
export async function loadUserE2bApiKey(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("connectors")
    .select("token_encrypted, provider")
    .eq("owner_id", ownerId)
    .eq("kind", "e2b")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[user-e2b]", error.message);
    return null;
  }

  for (const row of data ?? []) {
    const token = parseE2bTokenField(row.token_encrypted);
    if (token) return token;
  }

  return null;
}

export const E2B_SETUP_USER_MESSAGE =
  "Sandbox E2B não configurado. Cole sua chave em API Keys (/api) — o preview e o agente só rodam com a sua conta.";