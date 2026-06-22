const INNGEST_PREFIX = "https://inn.gs/e/";

/**
 * URL canônica para enviar eventos ao Inngest (inn.gs).
 * Fonte: INNGEST_EVENT_KEY — mesmo app que INNGEST_SIGNING_KEY no worker Vercel.
 */
export function resolveInngestEventUrl(env = process.env) {
  const key = (env.INNGEST_EVENT_KEY ?? "").trim();
  if (key) return `${INNGEST_PREFIX}${key}`;
  return null;
}

export function resolveInngestEventKey(env = process.env) {
  return (env.INNGEST_EVENT_KEY ?? "").trim() || null;
}