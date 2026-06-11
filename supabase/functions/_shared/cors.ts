/** CORS padrão FORGE — corpo vazio (não usar Response(null) na Edge). */

export const FORGE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function corsPreflightResponse(): Response {
  return new Response("ok", { status: 200, headers: FORGE_CORS_HEADERS });
}
