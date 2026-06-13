/**
 * Chaves de pesquisa web do motor Prometheus — uma provedora por usuário (/api).
 * Agente publicado usa tenant_secrets no editor (outro fluxo).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { WebSecrets } from "./web-research-providers.ts";

export type MotorWebSearchProvider = "brave" | "tavily" | "serper" | "firecrawl";

const SECRET_BY_PROVIDER: Record<MotorWebSearchProvider, string> = {
  brave: "BRAVE_SEARCH_API_KEY",
  tavily: "TAVILY_API_KEY",
  serper: "SERPER_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
};

function parseToken(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t || t.length < 4) return null;
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (Array.isArray(arr)) {
        const first = arr.find((x) => typeof x === "string" && x.trim().length >= 4);
        if (typeof first === "string") return first.trim();
      }
    } catch {
      /* single token */
    }
  }
  return t;
}

export interface MotorWebSearchConfig {
  provider: MotorWebSearchProvider | null;
  secrets: WebSecrets;
}

/** Uma chave, um provedor — lido de connectors.kind = web_search. */
export async function loadMotorWebSearch(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<MotorWebSearchConfig> {
  if (!ownerId) return { provider: null, secrets: {} };

  const { data, error } = await supabase
    .from("connectors")
    .select("token_encrypted, provider")
    .eq("owner_id", ownerId)
    .eq("kind", "web_search")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[motor-research]", error.message);
    return { provider: null, secrets: {} };
  }

  const provider = (data?.provider?.trim() || "") as MotorWebSearchProvider;
  if (!provider || !(provider in SECRET_BY_PROVIDER)) {
    return { provider: null, secrets: {} };
  }

  const token = parseToken(data?.token_encrypted);
  if (!token) return { provider: null, secrets: {} };

  const secretName = SECRET_BY_PROVIDER[provider];
  return { provider, secrets: { [secretName]: token } };
}