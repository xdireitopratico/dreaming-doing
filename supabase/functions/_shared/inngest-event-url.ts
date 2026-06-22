const INNGEST_PREFIX = "https://inn.gs/e/";

/** URL canônica inn.gs — INNGEST_EVENT_KEY (mesmo app que INNGEST_SIGNING_KEY). */
export function resolveInngestEventUrl(): string | null {
  const key = (Deno.env.get("INNGEST_EVENT_KEY") ?? "").trim();
  if (key) return `${INNGEST_PREFIX}${key}`;
  return null;
}

export function resolveInngestEventKey(): string | null {
  const key = (Deno.env.get("INNGEST_EVENT_KEY") ?? "").trim();
  return key || null;
}