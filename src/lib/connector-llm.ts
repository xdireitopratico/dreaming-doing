/** Detecta se o usuário tem chaves LLM (BYOK) a partir de `connectors_public`. */

const NON_LLM_CONNECTOR_KINDS = new Set([
  "github",
  "vercel",
  "netlify",
  "cloudflare",
  "supabase",
  "e2b",
]);

export function hasLlmConnectorRows(
  rows: Array<{ kind: string | null; provider?: string | null }> | undefined,
): boolean {
  if (!rows?.length) return false;
  return rows.some((r) => {
    const kind = r.kind;
    if (!kind) return false;
    if (NON_LLM_CONNECTOR_KINDS.has(kind)) return false;
    if (kind === "openai") {
      const provider = (r.provider ?? "").trim();
      return provider.length > 0;
    }
    return true;
  });
}
