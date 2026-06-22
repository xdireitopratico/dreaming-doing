import { resolveInngestEventUrl } from "./inngest-event-url.ts";

/**
 * Enqueue long-running gateway executions via Inngest
 */
export async function sendGatewayInngestEvent(
  data: Record<string, unknown>,
): Promise<{ ok: boolean; ids?: string[]; error?: string }> {
  const eventUrl = resolveInngestEventUrl();
  if (!eventUrl) {
    return { ok: false, error: "INNGEST_WEBHOOK or INNGEST_EVENT_KEY not configured" };
  }

  try {
    const res = await fetch(eventUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "aetherforge/flow.execute",
        data,
        ts: Date.now(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Inngest returned ${res.status}: ${text.substring(0, 200)}` };
    }

    const body = (await res.json()) as { ids?: string[] };
    if (!body.ids?.length) {
      return { ok: false, error: "Inngest returned no event ids" };
    }
    return { ok: true, ids: body.ids };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}