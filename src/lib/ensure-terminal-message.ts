/** Espelho testável de supabase/functions/_shared/ensure-terminal-message.ts */

export type StreamEventRow = {
  event_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
  seq?: number;
};

export type MessageParts = Array<{ type?: string; text?: string }>;

const TIMELINE_TYPES = new Set([
  "phase",
  "explore",
  "memory",
  "classify",
  "skills",
  "tool_start",
  "tool_done",
  "step_result",
  "assistant_text",
  "validate_ok",
  "validate_fail",
  "delivery_checkpoint",
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

const GENERIC_FAILURE_RE =
  /corrigindo erros de build|loop budget|retomando automaticamente|resumable/i;

export function isTerminalAssistantMeta(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta || typeof meta !== "object") return false;
  if (meta.partial === true) return false;
  return typeof meta.finishedAt === "string" && meta.finishedAt.trim().length > 0;
}

export function hasVisibleMessageText(
  parts: MessageParts | null | undefined,
  content?: string | null,
): boolean {
  if (content?.trim()) return true;
  if (!Array.isArray(parts)) return false;
  return parts.some(
    (p) => p?.type === "text" && typeof p.text === "string" && p.text.trim().length > 0,
  );
}

/** true quando ainda falta gravar (ou promover) mensagem terminal no chat. */
export function needsTerminalMessagePersist(
  existing: { parts?: MessageParts; meta?: Record<string, unknown> } | null,
): boolean {
  if (!existing) return true;
  if (isTerminalAssistantMeta(existing.meta) && hasVisibleMessageText(existing.parts)) {
    return false;
  }
  return true;
}

export function streamRowToTimelineEvent(row: StreamEventRow): {
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

export function buildStreamTailFromRows(
  rows: StreamEventRow[],
): Array<{ type: string; data: Record<string, unknown>; timestamp: number }> {
  return rows.map(streamRowToTimelineEvent).filter((e) => TIMELINE_TYPES.has(e.type)).slice(-120);
}

export function toolsFromTimeline(
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
  let lastFinal = "";
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
      if (fb.trim()) lastValidateFail = fb.trim();
    }
    if (ev.type === "assistant_text") {
      const text = typeof ev.data.text === "string" ? ev.data.text : "";
      if (ev.data.final === true && text.trim()) lastFinal = text.trim();
      else if ((ev.data.thinking === true || ev.data.delta === true) && text) thinking += text;
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
  if (err && !GENERIC_FAILURE_RE.test(err)) return err;
  if (lastFinal) return lastFinal;
  if (sum) return sum;
  if (thinking.trim()) return thinking.trim().slice(0, 8000);
  if (lastStreamError) return lastStreamError;
  if (err) return err;
  return "A execução terminou sem resposta gravada.";
}

export function buildTerminalCardSnapshot(opts: {
  streamText: string;
  timeline: Array<{ type: string; data: Record<string, unknown>; timestamp: number }>;
  error?: string | null;
  buildFailed?: boolean;
}): Record<string, unknown> {
  const tools = toolsFromTimeline(opts.timeline);
  return {
    timeline: opts.timeline,
    tools,
    diffs: [],
    streamText: opts.streamText,
    phase: "done",
    message: null,
    summary: null,
    error: opts.error ?? opts.streamText,
    finished: true,
    resumable: false,
    lastFinishOk: false,
    deliveryFiles: [],
    buildLogLines: [],
    stackForkSuggested: null,
    awaiting: false,
    awaitingKind: null,
    conversational: false,
    buildFailed: opts.buildFailed === true,
  };
}

export function buildTerminalMessageMeta(opts: {
  runId: string;
  text: string;
  streamTail: Array<{ type: string; data: Record<string, unknown>; timestamp: number }>;
  buildFailed?: boolean;
  error?: string | null;
}): Record<string, unknown> {
  const cardSnapshot = buildTerminalCardSnapshot({
    streamText: opts.text,
    timeline: opts.streamTail,
    error: opts.error ?? opts.text,
    buildFailed: opts.buildFailed,
  });
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