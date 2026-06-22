/** URL canônica inn.gs — INNGEST_WEBHOOK (completa) ou INNGEST_EVENT_KEY. */
export function resolveInngestEventUrl(): string | null {
  const webhook = (Deno.env.get("INNGEST_WEBHOOK") ?? "").trim();
  if (webhook.startsWith("https://inn.gs/e/")) return webhook;

  const key = (Deno.env.get("INNGEST_EVENT_KEY") ?? "").trim();
  if (key) return `https://inn.gs/e/${key}`;

  return null;
}

export function resolveInngestEventKey(): string | null {
  const url = resolveInngestEventUrl();
  if (!url) return null;
  const prefix = "https://inn.gs/e/";
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}