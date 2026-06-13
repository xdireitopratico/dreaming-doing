/**
 * egress-meter.ts — Instrumented fetch wrapper for outbound (egress) traffic.
 *
 * WHY: Lovable Cloud bills "data transfer / egress" for every byte an edge
 * function sends to (and receives from) external hosts (VPS, ChromaDB, LLM
 * providers, WhatsApp...). The project's own usage snapshot does NOT track this,
 * so a runaway loop can drain the balance invisibly. This wrapper records
 * bytes-out + bytes-in per destination + source function into `egress_ledger`
 * so the spend becomes attributable to a concrete origin.
 *
 * Design notes:
 *  - Non-blocking: the ledger insert is fire-and-forget; metering NEVER changes
 *    the response semantics or throws into the caller path.
 *  - Stream-safe: response bytes are taken from Content-Length when present.
 *    Only when the header is absent AND `measureResponseBody !== false` do we
 *    buffer the body (and we hand back a reconstructed Response so the caller
 *    can still read it normally).
 */

export interface MeteredFetchOptions {
  /** Logical origin (edge function / module name) for attribution. */
  source: string;
  /** Coarse category: "vps" | "chroma" | "llm" | "whatsapp" | "supabase" | "external". */
  category?: string;
  /**
   * When false, never buffer the response body to measure it (use Content-Length
   * only). Set false for streaming/large binary responses (audio, video).
   */
  measureResponseBody?: boolean;
  /** Extra context stored in metadata. */
  metadata?: Record<string, unknown>;
}

function hostOf(input: RequestInfo | URL): string {
  try {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    return new URL(u).host;
  } catch {
    return "unknown";
  }
}

function bytesOfBody(body: BodyInit | null | undefined): number {
  if (body == null) return 0;
  try {
    if (typeof body === "string") return new TextEncoder().encode(body).byteLength;
    if (body instanceof Uint8Array) return body.byteLength;
    if (body instanceof ArrayBuffer) return body.byteLength;
    if (body instanceof Blob) return body.size;
  } catch { /* ignore */ }
  return 0;
}

async function recordEgress(row: Record<string, unknown>): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return; // can't persist; skip silently
  try {
    await fetch(`${url}/rest/v1/egress_ledger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch {
    // Telemetry must never break the caller; swallow.
  }
}

/**
 * Drop-in replacement for fetch() that meters bytes and logs to egress_ledger.
 * Returns a Response the caller can consume exactly like a normal fetch().
 */
export async function meteredFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: MeteredFetchOptions,
): Promise<Response> {
  const started = Date.now();
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const destination = hostOf(input);
  const bytesOut = bytesOfBody(init?.body as BodyInit | null | undefined);

  let res: Response;
  try {
    res = await fetch(input as RequestInfo, init);
  } catch (err) {
    // Record the failed attempt (request bytes still left the platform).
    void recordEgress({
      source_function: opts.source,
      destination,
      category: opts.category ?? "external",
      method,
      bytes_out: bytesOut,
      bytes_in: 0,
      status_code: null,
      duration_ms: Date.now() - started,
      ok: false,
      metadata: { ...(opts.metadata ?? {}), error: String(err).slice(0, 200) },
    });
    throw err;
  }

  const durationMs = Date.now() - started;
  const cl = res.headers.get("content-length");
  let bytesIn = cl ? parseInt(cl, 10) || 0 : 0;
  let out = res;

  if (!cl && opts.measureResponseBody !== false) {
    // No Content-Length: buffer to measure, then rebuild a readable Response.
    try {
      const buf = await res.arrayBuffer();
      bytesIn = buf.byteLength;
      out = new Response(buf, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } catch {
      out = res; // if buffering fails, return original
    }
  }

  void recordEgress({
    source_function: opts.source,
    destination,
    category: opts.category ?? "external",
    method,
    bytes_out: bytesOut,
    bytes_in: bytesIn,
    status_code: res.status,
    duration_ms: durationMs,
    ok: res.ok,
    metadata: opts.metadata ?? {},
  });

  return out;
}