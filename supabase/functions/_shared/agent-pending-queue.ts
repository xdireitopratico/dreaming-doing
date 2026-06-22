/**
 * Fila agent_pending_messages — enqueue no agent-run; drain via continue_queue.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CHUNK_HANDOFF_GAP_MS } from "./agent-chunk-limits.ts";

export { CHUNK_HANDOFF_GAP_MS };
import { appendStreamEvent } from "./agent-stream.ts";
import { logger } from "./logger.ts";
import { transitionRun } from "./run-lifecycle.ts";

/** H8 fix: STALE_RUN_MS 8min → 15min, BUSY_ZOMBIE_GAP_MS 3min → 8min.
 *  Alinhado com heartbeat 30s + tempo máximo de observe() (5min).
 *  Evita falso "zumbi" quando o agente está vivo processando build longo. */
const STALE_RUN_MS = 15 * 60 * 1000;
/** Com itens na fila, runs sem heartbeat expiram mais cedo para destravar drain. */
const QUEUE_STALE_RUN_MS = 5 * 60 * 1000;
/** Gap sem eventos de stream — UX "zumbi" no toast busy. */
export const BUSY_ZOMBIE_GAP_MS = 8 * 60 * 1000;

export type AgentBusyReason = "zombie" | "running" | "other_conversation";

export function classifyAgentBusyReason(input: {
  status?: string | null;
  staleExpired?: boolean;
  lastActivityAgeMs?: number | null;
  otherConversation?: boolean;
}): AgentBusyReason {
  if (input.otherConversation) return "other_conversation";
  if (input.staleExpired) return "zombie";
  const age = input.lastActivityAgeMs;
  if (
    age != null &&
    age > BUSY_ZOMBIE_GAP_MS &&
    (input.status === "running" || input.status === "pending")
  ) {
    return "zombie";
  }
  return "running";
}

export async function resolveAgentBusyReason(
  supabase: SupabaseClient,
  run: { id: string; status: string; meta?: unknown; started_at?: string | null } | null,
  opts?: { otherConversation?: boolean },
): Promise<AgentBusyReason> {
  if (opts?.otherConversation) return "other_conversation";
  if (!run) return "running";

  const meta = (run.meta ?? {}) as Record<string, unknown>;
  if (meta.staleExpired === true) {
    return "zombie";
  }

  const { data: lastEv } = await supabase
    .from("agent_stream_events")
    .select("created_at")
    .eq("run_id", run.id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastAt = (lastEv?.created_at ?? run.started_at) as string | null | undefined;
  const lastActivityAgeMs = lastAt ? Date.now() - new Date(lastAt).getTime() : null;

  return classifyAgentBusyReason({
    status: run.status,
    staleExpired: false,
    lastActivityAgeMs,
  });
}

export type PendingQueueItem = {
  id: string;
  createdAt: string;
  preview: string;
  body: Record<string, unknown>;
};

/** Run em handoff entre chunks — não expirar como zumbi dentro da janela de graça. */
export function shouldSkipStaleExpiry(input: {
  meta: Record<string, unknown>;
  lastEventType?: string | null;
  lastEventAt?: string | null;
  nowMs?: number;
}): boolean {
  const nowMs = input.nowMs ?? Date.now();
  const chunkHandoffGraceMs = CHUNK_HANDOFF_GAP_MS * 2;
  const meta = input.meta;

  if (meta.betweenChunks === true) {
    const lastChunkAt = meta.lastChunkAt as string | undefined;
    if (!lastChunkAt) return true;
    const chunkAgeMs = nowMs - new Date(lastChunkAt).getTime();
    if (chunkAgeMs <= chunkHandoffGraceMs) return true;
  }

  if (input.lastEventType === "chunk_resume" && input.lastEventAt) {
    const chunkAgeMs = nowMs - new Date(input.lastEventAt).getTime();
    if (chunkAgeMs <= chunkHandoffGraceMs) return true;
  }

  return false;
}

export async function expireStaleRuns(
  supabase: SupabaseClient,
  projectId: string,
  maxAgeMs: number = STALE_RUN_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  const { data: candidates } = await supabase
    .from("agent_runs")
    .select("id, meta, started_at, heartbeat_at")
    .eq("project_id", projectId)
    // awaiting_user NÃO entra: runs pausadas esperando humano (plan_approval /
    // clarify) não heartbeatem por design — expirá-las pelo threshold de 8min
    // mata aprovações de plano legítimas (bug: run virava zumbi enquanto o
    // usuário lia o plano). A limpeza de awaiting_user abandonado acontece em
    // agent-run/index.ts: ao chegar nova mensagem, a run awaiting antiga é
    // completada antes de criar a nova.
    .in("status", ["running", "pending"]);

  if (!candidates?.length) return 0;

  const staleIds: string[] = [];
  for (const run of candidates) {
    const meta = (run.meta ?? {}) as Record<string, unknown>;

    const { data: lastEv } = await supabase
      .from("agent_stream_events")
      .select("created_at, event_type")
      .eq("run_id", run.id)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      shouldSkipStaleExpiry({
        meta,
        lastEventType: (lastEv?.event_type as string | undefined) ?? null,
        lastEventAt: (lastEv?.created_at as string | undefined) ?? null,
      })
    ) {
      continue;
    }

    const heartbeat = (run.heartbeat_at ?? run.started_at) as string | null;
    if (heartbeat && heartbeat < cutoff) {
      staleIds.push(run.id as string);
      continue;
    }

    const lastActivity = (lastEv?.created_at ?? run.started_at) as string | null;
    if (lastActivity && lastActivity < cutoff) {
      staleIds.push(run.id as string);
    }
  }

  if (!staleIds.length) return 0;

  for (const id of staleIds) {
    const run = candidates.find((r) => r.id === id);
    const meta = (run?.meta ?? {}) as Record<string, unknown>;
    const resumable = meta.checkpoint === true || meta.resume === true;
    const error = resumable
      ? "Execução interrompida (worker expirou). Clique em **Continuar** para retomar do checkpoint."
      : "Run expirado (zumbi) — tente enviar de novo.";

    await transitionRun(supabase, id, "failed", {
      error,
      meta: { ...meta, staleExpired: true, resumable },
    });

    await appendStreamEvent(supabase, id, "finish", {
      type: "finish",
      ok: false,
      resumable,
      error,
      stale: true,
    });

    logger.warn("agent_run.stale_expired", { runId: id, projectId, resumable });
  }

  return staleIds.length;
}

export async function countPendingMessages(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("agent_pending_messages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", userId);
  return count ?? 0;
}

/**
 * Precisa de resposta se há mensagem user mais nova que o último assistant.
 * (Evita apagar fila quando user enfileirou durante run e assistant terminou depois.)
 */
export async function conversationNeedsAgentResponse(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<boolean> {
  const { data: lastAssistant } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "user");

  if (lastAssistant?.created_at) {
    query = query.gt("created_at", lastAssistant.created_at);
  }

  const { count } = await query;
  return (count ?? 0) > 0;
}

const CHUNK_HANDOFF_EVENT_TYPES = new Set(["delivery_checkpoint"]);

export async function hasBlockingActiveRun(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("agent_runs")
    .select("id, status, meta")
    .eq("project_id", projectId)
    .in("status", ["running", "pending", "awaiting_user"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.id) return null;
  if (data.status === "awaiting_user") return data.id;

  const meta = (data.meta ?? {}) as Record<string, unknown>;
  const lastChunkAt = meta.lastChunkAt as string | undefined;
  if (!lastChunkAt && meta.betweenChunks !== true) return data.id;

  const { data: lastEv } = await supabase
    .from("agent_stream_events")
    .select("created_at, event_type")
    .eq("run_id", data.id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastEvTime = (lastEv?.created_at ?? lastChunkAt) as string | undefined;
  if (!lastEvTime) return data.id;

  const gapMs = Date.now() - new Date(lastEvTime).getTime();
  const handoff = !!lastEv && CHUNK_HANDOFF_EVENT_TYPES.has(lastEv.event_type as string);

  if (handoff && gapMs > CHUNK_HANDOFF_GAP_MS) {
    return null;
  }

  return data.id;
}

export async function clearPendingMessages(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  messageId?: string,
): Promise<number> {
  let query = supabase
    .from("agent_pending_messages")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (messageId) {
    query = query.eq("id", messageId);
  }

  const { data } = await query.select("id");
  return data?.length ?? 0;
}

export function previewFromQueueBody(body: Record<string, unknown>): string {
  if (typeof body.text === "string" && body.text.trim()) {
    return body.text.trim().slice(0, 280);
  }
  const parts = body.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .filter((p) => p && typeof p === "object" && (p as { type?: string }).type === "text")
      .map((p) => String((p as { text?: string }).text ?? "").trim())
      .filter(Boolean)
      .join("\n");
    if (text) return text.slice(0, 280);
  }
  return "Pedido enfileirado (snapshot de preferências)";
}

export async function listPendingMessages(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<PendingQueueItem[]> {
  const { data } = await supabase
    .from("agent_pending_messages")
    .select("id, body, created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => {
    const body = (row.body ?? {}) as Record<string, unknown>;
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      preview: previewFromQueueBody(body),
      body,
    };
  });
}

/** Snapshot da última mensagem user para exibir/copiar na fila. */
export async function latestUserMessageSnapshot(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<Record<string, unknown> | null> {
  const { data: row } = await supabase
    .from("messages")
    .select("id, parts, created_at, meta")
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row?.id) return null;

  const parts = Array.isArray(row.parts) ? row.parts : [];
  const text = parts
    .filter((p) => p && typeof p === "object" && (p as { type?: string }).type === "text")
    .map((p) => String((p as { text?: string }).text ?? "").trim())
    .filter(Boolean)
    .join("\n");

  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const msgMode = typeof meta.mode === "string" ? meta.mode.toLowerCase() : null;

  return {
    messageId: row.id,
    text: text || undefined,
    parts,
    createdAt: row.created_at,
    ...(msgMode === "plan" || msgMode === "build" || msgMode === "chat" ? { mode: msgMode } : {}),
  };
}

/** Modo do próximo run ao drenar fila — pendingBody.mode > user msg meta > input fallback. */
export function resolveQueuedPlanMode(input: {
  pendingBody: Record<string, unknown> | null;
  messageMetaMode?: string | null;
  inputPlanMode?: boolean;
}): boolean {
  const bodyMode =
    typeof input.pendingBody?.mode === "string"
      ? String(input.pendingBody.mode).toLowerCase()
      : null;
  const metaMode =
    typeof input.messageMetaMode === "string" ? input.messageMetaMode.toLowerCase() : null;
  const storedMode = bodyMode ?? metaMode;

  if (storedMode === "plan") return true;
  if (storedMode === "build" || storedMode === "chat") return false;
  return input.inputPlanMode === true;
}

export type PendingMessagePeek = {
  id: string;
  body: Record<string, unknown>;
};

/** Lê o mais antigo sem remover — commit só após dispatch bem-sucedido. */
export async function peekOldestPendingMessage(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<PendingMessagePeek | null> {
  const { data: row } = await supabase
    .from("agent_pending_messages")
    .select("id, body")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!row?.id) return null;
  return {
    id: row.id as string,
    body: (row.body ?? {}) as Record<string, unknown>,
  };
}

export async function removePendingMessageById(
  supabase: SupabaseClient,
  pendingId: string,
): Promise<void> {
  await supabase.from("agent_pending_messages").delete().eq("id", pendingId);
}

/** @deprecated Prefer peek + removePendingMessageById after successful dispatch. */
export async function popOldestPendingMessage(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const peeked = await peekOldestPendingMessage(supabase, projectId, userId);
  if (!peeked) return null;
  await removePendingMessageById(supabase, peeked.id);
  return peeked.body;
}

export type QueueDrainDecision = {
  shouldContinue: boolean;
  pendingCount: number;
  needsResponse: boolean;
  blockingRunId: string | null;
};

/**
 * Remove apenas entradas prefs-only duplicadas consecutivas (connect concorrente).
 * Não colapsa mensagens distintas do usuário.
 */
export async function sanitizePendingQueue(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  conversationId: string,
): Promise<number> {
  const needsResponse = await conversationNeedsAgentResponse(supabase, conversationId);
  if (!needsResponse) {
    return await clearPendingMessages(supabase, projectId, userId);
  }

  const { data: rows } = await supabase
    .from("agent_pending_messages")
    .select("id, body, created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (!rows || rows.length <= 1) return rows?.length ?? 0;

  const seenMessageIds = new Set<string>();
  const staleIds: string[] = [];

  for (const row of rows) {
    const body = (row.body ?? {}) as Record<string, unknown>;
    const messageId = typeof body.messageId === "string" ? body.messageId : null;
    if (!messageId) continue;
    if (seenMessageIds.has(messageId)) {
      staleIds.push(row.id as string);
    } else {
      seenMessageIds.add(messageId);
    }
  }

  const prefsOnly = rows.filter((r) => {
    const body = (r.body ?? {}) as Record<string, unknown>;
    if (typeof body.messageId === "string") return false;
    return !(typeof body.text === "string" && body.text.trim());
  });
  if (prefsOnly.length > 1) {
    const keepId = prefsOnly[prefsOnly.length - 1]!.id as string;
    for (const row of prefsOnly) {
      if (row.id !== keepId) staleIds.push(row.id as string);
    }
  }

  const uniqueStale = [...new Set(staleIds)];
  if (uniqueStale.length > 0) {
    await supabase.from("agent_pending_messages").delete().in("id", uniqueStale);
  }

  return await countPendingMessages(supabase, projectId, userId);
}

export async function evaluateQueueDrain(
  supabase: SupabaseClient,
  projectId: string,
  conversationId: string,
  userId: string,
): Promise<QueueDrainDecision> {
  const pendingBefore = await countPendingMessages(supabase, projectId, userId);
  const staleMs = pendingBefore > 0 ? QUEUE_STALE_RUN_MS : STALE_RUN_MS;
  await expireStaleRuns(supabase, projectId, staleMs);
  await sanitizePendingQueue(supabase, projectId, userId, conversationId);

  const pendingCount = await countPendingMessages(supabase, projectId, userId);
  const needsResponse = await conversationNeedsAgentResponse(supabase, conversationId);
  const blockingRunId = await hasBlockingActiveRun(supabase, projectId);

  const shouldContinue = (pendingCount > 0 || needsResponse) && !blockingRunId;

  return { shouldContinue, pendingCount, needsResponse, blockingRunId };
}

/** Corpo da fila: prefs + snapshot da última mensagem user (texto para UI/drain). */
export async function buildQueueInsertBody(
  supabase: SupabaseClient,
  conversationId: string,
  base: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const snap = await latestUserMessageSnapshot(supabase, conversationId);
  if (!snap) return base;
  return { ...base, ...snap };
}
