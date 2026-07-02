import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logger } from "./logger.ts";

export type StreamEventRow = {
  event_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
  seq?: number;
};

const TIMELINE_TYPES = new Set([
  "phase",
  "explore",
  "memory",
  "skills",
  "tool_start",
  "tool_done",
  "step_result",
  "assistant_text",
  "validate_ok",
  "validate_fail",
  "file_diff",
  "done",
  "finish",
  "timeout_warning",
  "heartbeat",
  "error",
  "stuck",
  "robin_rotate",
  "rate_limit",
]);

const GENERIC_FAILURE_RE = /loop budget|resumable/i;

export function isTerminalAssistantMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false;
  if (meta.partial === true) return false;
  if (meta.checkpoint === true) return false;
  return typeof meta.finishedAt === "string" && meta.finishedAt.trim().length > 0;
}

function hasVisibleMessageText(
  parts: Array<{ type?: string; text?: string }> | null | undefined,
): boolean {
  if (!Array.isArray(parts)) return false;
  return parts.some(
    (p) => p?.type === "text" && typeof p.text === "string" && p.text.trim().length > 0,
  );
}

export function needsTerminalMessagePersist(
  existing: {
    parts?: Array<{ type?: string; text?: string }>;
    meta?: Record<string, unknown>;
  } | null,
): boolean {
  if (!existing) return true;
  if (isTerminalAssistantMeta(existing.meta) && hasVisibleMessageText(existing.parts)) {
    return false;
  }
  return true;
}

function streamRowToTimelineEvent(row: StreamEventRow): {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
} {
  const payload = row.payload ?? {};
  const eventType = (payload.type as string) ?? row.event_type;
  const hasNestedData = payload.data && typeof payload.data === "object";
  const eventData = hasNestedData
    ? (payload.data as Record<string, unknown>)
    : Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "type"));
  return {
    type: eventType,
    data: eventData,
    timestamp: row.created_at ? Date.parse(row.created_at) : Date.now(),
  };
}

function buildStreamTailFromRows(
  rows: StreamEventRow[],
): Array<{ type: string; data: Record<string, unknown>; timestamp: number }> {
  return rows
    .map(streamRowToTimelineEvent)
    .filter((e) => TIMELINE_TYPES.has(e.type))
    .slice(-120);
}

function toolsFromTimeline(
  timeline: Array<{ type: string; data: Record<string, unknown> }>,
): Array<{ name: string; args: Record<string, unknown>; ok?: boolean; error?: string }> {
  const tools: Array<{
    name: string;
    args: Record<string, unknown>;
    ok?: boolean;
    error?: string;
  }> = [];
  for (const ev of timeline) {
    if (ev.type === "tool_start") {
      tools.push({
        name: typeof ev.data.name === "string" ? ev.data.name : "?",
        args: (ev.data.args as Record<string, unknown>) ?? {},
      });
      continue;
    }
    if (ev.type === "tool_done") {
      const toolName = typeof ev.data.name === "string" ? ev.data.name : "?";
      for (let i = tools.length - 1; i >= 0; i--) {
        if (tools[i].name === toolName && tools[i].ok === undefined) {
          tools[i].ok = ev.data.ok === true;
          tools[i].error = typeof ev.data.error === "string" ? ev.data.error : undefined;
          break;
        }
      }
    }
  }
  return tools;
}

export function resolveTerminalDisplayText(opts: {
  error?: string | null;
  summary?: string | null;
  streamRows?: StreamEventRow[];
}): string {
  const rows = opts.streamRows ?? [];
  let lastValidateFail = "";
  let lastPreflightFail = "";
  let lastFinal = "";
  let lastThinking = "";
  let thinking = "";
  let lastStreamError = "";

  for (const row of rows) {
    const ev = streamRowToTimelineEvent(row);
    if (ev.type === "validate_fail") {
      const fb =
        typeof ev.data.feedback === "string"
          ? ev.data.feedback
          : typeof ev.data.message === "string"
            ? ev.data.message
            : "";
      if (fb.trim()) {
        if (ev.data.preflight === true) lastPreflightFail = fb.trim();
        else lastValidateFail = fb.trim();
      }
    }
    if (ev.type === "assistant_text") {
      const text = typeof ev.data.text === "string" ? ev.data.text : "";
      if (ev.data.final === true && text.trim()) lastFinal = text.trim();
      else if ((ev.data.thinking === true || ev.data.delta === true) && text) thinking += text;
    }
    if (ev.type === "thinking_text") {
      const text = typeof ev.data.text === "string" ? ev.data.text : "";
      if ((ev.data.final === true || ev.data.delta === true) && text) lastThinking += text;
    }
    if (ev.type === "error" && typeof ev.data.message === "string" && ev.data.message.trim()) {
      lastStreamError = ev.data.message.trim();
    }
  }

  const err = opts.error?.trim() ?? "";
  const sum = opts.summary?.trim() ?? "";

  if (lastValidateFail && (!err || GENERIC_FAILURE_RE.test(err))) {
    return `Build não foi concluído.\n\n${lastValidateFail.slice(0, 2000)}`;
  }
  if (lastPreflightFail && (!err || GENERIC_FAILURE_RE.test(err))) {
    return `Preflight não foi concluído.\n\n${lastPreflightFail.slice(0, 2000)}`;
  }
  if (err && !GENERIC_FAILURE_RE.test(err)) return err;
  if (lastFinal) return lastFinal;
  if (sum) return sum;
  if (lastThinking.trim()) return lastThinking.trim().slice(0, 8000);
  if (thinking.trim()) return thinking.trim().slice(0, 8000);
  if (lastStreamError) return lastStreamError;
  if (err) return err;
  return "A execução terminou sem resposta gravada.";
}

function buildTerminalMessageMeta(opts: {
  runId: string;
  text: string;
  streamTail: Array<{ type: string; data: Record<string, unknown>; timestamp: number }>;
  buildFailed?: boolean;
  error?: string | null;
}): Record<string, unknown> {
  const tools = toolsFromTimeline(opts.streamTail);
  const firstTs = opts.streamTail[0]?.timestamp ?? null;
  const lastTs = opts.streamTail.at(-1)?.timestamp ?? null;
  const workingDurationMs =
    firstTs != null && lastTs != null ? Math.max(1000, lastTs - firstTs) : undefined;
  const cardSnapshot: Record<string, unknown> = {
    timeline: opts.streamTail,
    tools,
    diffs: [],
    streamText: opts.text,
    phase: "done",
    message: null,
    summary: null,
    error: opts.error ?? opts.text,
    finished: true,
    resumable: false,
    lastFinishOk: false,
    workingDurationMs,
    deliveryFiles: [],
    buildLogLines: [],
    stackForkSuggested: null,
    awaiting: false,
    awaitingKind: null,
    conversational: false,
    buildFailed: opts.buildFailed === true,
  };

  return {
    runId: opts.runId,
    partial: false,
    finishedAt: new Date().toISOString(),
    lastFinishOk: false,
    buildFailed: opts.buildFailed === true,
    streamTail: opts.streamTail,
    cardSnapshot,
    deliveryFiles: [],
    executionLog: [],
  };
}

async function fetchStreamRows(supabase: SupabaseClient, runId: string): Promise<StreamEventRow[]> {
  const { data } = await supabase
    .from("agent_stream_events")
    .select("event_type, payload, created_at, seq")
    .eq("run_id", runId)
    .order("seq", { ascending: true })
    .limit(500);
  return (data ?? []) as StreamEventRow[];
}

async function findAssistantMessageForRun(
  supabase: SupabaseClient,
  conversationId: string,
  runId: string,
): Promise<{
  id: string;
  parts?: Array<{ type?: string; text?: string }>;
  meta?: Record<string, unknown>;
} | null> {
  const { data } = await supabase
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

export type EnsureTerminalMessageParams = {
  runId: string;
  conversationId: string;
  projectId: string;
  error?: string | null;
  summary?: string | null;
  buildFailed?: boolean;
};

/**
 * Garante mensagem assistant terminal em `messages` quando o loop terminou
 * sem `persistFinal` (resumableExhausted, chunk cap, falha terminal).
 */
export async function ensureTerminalRunMessage(
  supabase: SupabaseClient,
  params: EnsureTerminalMessageParams,
): Promise<{ persisted: boolean; messageId?: string }> {
  const { runId, conversationId, projectId, error, summary, buildFailed } = params;

  try {
    const existing = await findAssistantMessageForRun(supabase, conversationId, runId);
    if (!needsTerminalMessagePersist(existing)) {
      return { persisted: false, messageId: existing?.id };
    }

    const streamRows = await fetchStreamRows(supabase, runId);
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
      const updateData: Record<string, unknown> = {
        tool_calls: [],
        meta,
      };
      if (text) {
        updateData.parts = [{ type: "text", text }];
      }
      await supabase.from("messages").update(updateData).eq("id", existing.id);
      await supabase
        .from("projects")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", projectId);
      return { persisted: true, messageId: existing.id };
    }

    if (!text) return { persisted: false };

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
  } catch (err) {
    logger.error("ensure_terminal_message.failed", {
      runId,
      conversationId,
      error: (err as Error)?.message,
    });
    return { persisted: false };
  }
}
