/**
 * streaming-telemetry (server) — Fire-and-forget observability for chat
 * reliability from Edge Functions.
 *
 * Mirrors the client-side helper in `src/lib/streaming-telemetry.ts`. The
 * event_name vocabulary is shared and treated as a contract. Server emits
 * the run-lifecycle events (run_started, run_dispatch_failed, run_first_byte,
 * stream_seq_gap); client emits the UX events (rendered, dropped, reconnect).
 *
 * Design rules (see client helper for full rationale):
 *   1. Never block the calling code path on telemetry.
 *   2. Never throw. Use `try/catch` around the `await`.
 *   3. Stable event names.
 *   4. Minimal payload.
 *
 * The server uses the Supabase service-role key (already present in the Edge
 * env) to write to the same `agent_streaming_telemetry` table the client reads
 * from. RLS does not block service-role writes.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type EmitContext = {
  projectId: string;
  runId?: string | null;
};

export type StreamingTelemetryEventName =
  | "chat.user_message_inserted"
  | "agent.run_started"
  | "agent.run_first_byte"
  | "agent.run_dispatch_failed"
  | "agent.stream_seq_gap";

let currentContext: EmitContext | null = null;

export function setStreamingTelemetryContextServer(ctx: EmitContext | null) {
  currentContext = ctx;
}

export async function emitStreamingTelemetryServer(
  supabase: SupabaseClient,
  eventName: StreamingTelemetryEventName,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const projectId = currentContext?.projectId ?? payload.projectId;
  if (!projectId) return;
  try {
    await (supabase.from("agent_streaming_telemetry" as never) as any).insert({
      project_id: projectId,
      run_id: currentContext?.runId ?? payload.runId ?? null,
      event_name: eventName,
      payload,
    });
  } catch {
    // best-effort; never block
  }
}
