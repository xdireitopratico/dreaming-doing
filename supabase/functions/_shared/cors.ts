/** CORS padrão FORGE — corpo vazio (não usar Response(null) na Edge). */

const RAW_ORIGINS = Deno.env.get("FORGE_ALLOWED_ORIGINS") ?? "";

const ALLOWED_ORIGINS: string[] = RAW_ORIGINS
  ? RAW_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  : [];

export function forgeOrigin(requestOrigin?: string | null): string {
  if (ALLOWED_ORIGINS.length === 0) return "*";
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}

export function forgeCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = forgeOrigin(requestOrigin);
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(origin !== "*" ? { Vary: "Origin" } : {}),
  };
}

/** @deprecated Use forgeCorsHeaders(req.headers.get("origin")) for origin-aware CORS. */
export const FORGE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function corsPreflightResponse(requestOrigin?: string | null): Response {
  return new Response("ok", { status: 200, headers: forgeCorsHeaders(requestOrigin) });
}
