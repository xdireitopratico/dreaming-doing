const INNGEST_PREFIX = "https://inn.gs/e/";

function extractKeyFromUrl(url: string): string | null {
  if (!url.startsWith(INNGEST_PREFIX)) return null;
  return url.slice(INNGEST_PREFIX.length);
}

export type InngestEventConfig = {
  webhookUrl: string | null;
  eventKeyUrl: string | null;
  dispatchUrl: string | null;
  keysMatch: boolean;
  keyMismatch: boolean;
};

/** INNGEST_WEBHOOK (visibilidade) vs INNGEST_EVENT_KEY (worker) — devem ser o mesmo app. */
export function resolveInngestEventConfig(): InngestEventConfig {
  const webhook = (Deno.env.get("INNGEST_WEBHOOK") ?? "").trim();
  const webhookUrl = webhook.startsWith(INNGEST_PREFIX) ? webhook : null;
  const webhookKey = webhookUrl ? extractKeyFromUrl(webhookUrl) : null;

  const eventKey = (Deno.env.get("INNGEST_EVENT_KEY") ?? "").trim();
  const eventKeyUrl = eventKey ? `${INNGEST_PREFIX}${eventKey}` : null;

  const keysMatch = !!(webhookKey && eventKey && webhookKey === eventKey);

  let dispatchUrl: string | null = null;
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

/** URL para dispatch — alinhada ao worker Vercel. */
export function resolveInngestEventUrl(): string | null {
  return resolveInngestEventConfig().dispatchUrl;
}

export function resolveInngestEventKey(): string | null {
  const url = resolveInngestEventUrl();
  if (!url) return null;
  return extractKeyFromUrl(url);
}