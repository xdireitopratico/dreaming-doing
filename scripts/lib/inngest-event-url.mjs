const INNGEST_PREFIX = "https://inn.gs/e/";

function extractKeyFromUrl(url) {
  if (!url?.startsWith(INNGEST_PREFIX)) return null;
  return url.slice(INNGEST_PREFIX.length);
}

/**
 * INNGEST_WEBHOOK — URL de visibilidade no dashboard (pode ser exibida em health checks).
 * INNGEST_EVENT_KEY — chave do app ligado ao worker Vercel (INNGEST_SIGNING_KEY).
 *
 * Se as duas chaves diferem, eventos enviados só ao webhook NÃO chegam ao worker.
 */
export function resolveInngestEventConfig(env = process.env) {
  const webhook = (env.INNGEST_WEBHOOK ?? "").trim();
  const webhookUrl = webhook.startsWith(INNGEST_PREFIX) ? webhook : null;
  const webhookKey = webhookUrl ? extractKeyFromUrl(webhookUrl) : null;

  const eventKey = (env.INNGEST_EVENT_KEY ?? "").trim();
  const eventKeyUrl = eventKey ? `${INNGEST_PREFIX}${eventKey}` : null;

  const keysMatch = !!(webhookKey && eventKey && webhookKey === eventKey);

  /** URL usada para dispatch — sempre alinhada ao worker quando há mismatch. */
  let dispatchUrl = null;
  if (keysMatch && webhookUrl) {
    dispatchUrl = webhookUrl;
  } else if (eventKeyUrl) {
    dispatchUrl = eventKeyUrl;
  } else if (webhookUrl) {
    dispatchUrl = webhookUrl;
  }

  return {
    webhookUrl,
    eventKeyUrl,
    dispatchUrl,
    keysMatch,
    keyMismatch: !!(webhookKey && eventKey && webhookKey !== eventKey),
  };
}

/** URL para enviar eventos — alinhada ao worker Vercel. */
export function resolveInngestEventUrl(env = process.env) {
  return resolveInngestEventConfig(env).dispatchUrl;
}

export function resolveInngestEventKey(env = process.env) {
  const url = resolveInngestEventUrl(env);
  if (!url) return null;
  return extractKeyFromUrl(url);
}