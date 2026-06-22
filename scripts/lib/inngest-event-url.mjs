/**
 * URL canônica para enviar eventos ao Inngest (inn.gs).
 * Preferência: INNGEST_WEBHOOK (URL completa) → INNGEST_EVENT_KEY.
 */
export function resolveInngestEventUrl(env = process.env) {
  const webhook = (env.INNGEST_WEBHOOK ?? "").trim();
  if (webhook.startsWith("https://inn.gs/e/")) return webhook;

  const key = (env.INNGEST_EVENT_KEY ?? "").trim();
  if (key) return `https://inn.gs/e/${key}`;

  return null;
}

export function resolveInngestEventKey(env = process.env) {
  const url = resolveInngestEventUrl(env);
  if (!url) return null;
  const prefix = "https://inn.gs/e/";
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}