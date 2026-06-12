import {
  buildStreamTailFromRows,
  buildTerminalMessageMeta,
  needsTerminalMessagePersist,
  resolveTerminalDisplayText,
  type StreamEventRow,
} from "@/lib/ensure-terminal-message";
import { getSupabaseAdmin } from "./_shared";

export type EnsureTerminalMessageParams = {
  runId: string;
  conversationId: string;
  projectId: string;
  error?: string | null;
  summary?: string | null;
  buildFailed?: boolean;
};

async function fetchStreamRows(runId: string): Promise<StreamEventRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("agent_stream_events")
    .select("event_type, payload, created_at, seq")
    .eq("run_id", runId)
    .order("seq", { ascending: true })
    .limit(500);
  return (data ?? []) as StreamEventRow[];
}

async function findAssistantMessageForRun(
  conversationId: string,
  runId: string,
): Promise<{
  id: string;
  parts?: Array<{ type?: string; text?: string }>;
  meta?: Record<string, unknown>;
} | null> {
  const { data } = await getSupabaseAdmin()
    .from("messages")
    .select("id, parts, meta")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .filter("meta->>runId", "eq", runId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    (data as {
      id: string;
      parts?: Array<{ type?: string; text?: string }>;
      meta?: Record<string, unknown>;
    } | null) ?? null
  );
}

/** Inngest: grava mensagem terminal quando markRunFinal não passou pelo persistFinal do loop. */
export async function ensureTerminalRunMessage(
  params: EnsureTerminalMessageParams,
): Promise<{ persisted: boolean; messageId?: string }> {
  const { runId, conversationId, projectId, error, summary, buildFailed } = params;
  const supabase = getSupabaseAdmin();

  try {
    const existing = await findAssistantMessageForRun(conversationId, runId);
    if (!needsTerminalMessagePersist(existing)) {
      return { persisted: false, messageId: existing?.id };
    }

    const streamRows = await fetchStreamRows(runId);
    const streamTail = buildStreamTailFromRows(streamRows);
    const text = resolveTerminalDisplayText({ error, summary, streamRows });
    const meta = buildTerminalMessageMeta({
      runId,
      text,
      streamTail,
      buildFailed: buildFailed === true,
      error: error ?? text,
    });

    if (existing?.id) {
      await supabase
        .from("messages")
        .update({
          parts: [{ type: "text", text }],
          tool_calls: [],
          meta,
        })
        .eq("id", existing.id);
      await supabase
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", projectId);
      return { persisted: true, messageId: existing.id };
    }

    const { data: inserted } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        parts: [{ type: "text", text }],
        tool_calls: [],
        meta,
      })
      .select("id")
      .single();

    await supabase
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", projectId);

    return { persisted: true, messageId: (inserted as { id?: string } | null)?.id };
  } catch {
    return { persisted: false };
  }
}