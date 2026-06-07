// agent-worker — consome PGMQ agent_chunks; mesmo AgentLoop do agent-run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";
import {
  deleteAgentChunk,
  enqueueAgentChunk,
  invokeAgentWorker,
  readAgentChunk,
  type AgentChunkMessage,
} from "../_shared/agent-queue.ts";
import { appendStreamEvent } from "../_shared/agent-stream.ts";
import { executeAgentJob } from "../agent-run/run-job.ts";
import { normalizeIdList } from "../_shared/session-extensions.ts";
import { logger } from "../_shared/logger.ts";
import type { AgentPreferencesPayload } from "../agent-run/connector-keys.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_SERVER_CHUNKS = 64;

async function finalizeRun(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  runId: string,
  result: {
    ok: boolean;
    error?: string;
    steps: number;
    canceled?: boolean;
    summary?: string;
    toolsUsed?: string[];
  },
): Promise<void> {
  // Lê estado atual para NÃO sobrescrever status de espera
  const { data: current } = await supabase
    .from("agent_runs")
    .select("status, meta")
    .eq("id", runId)
    .maybeSingle();
  const currentStatus = current?.status as string | undefined;
  const currentMeta = (current?.meta ?? {}) as Record<string, unknown>;
  const awaitingStates = ["awaiting_user"];
  const isAwaiting = awaitingStates.includes(currentStatus ?? "") || !!currentMeta.awaitingUser;

  let status: string;
  if (result.canceled) {
    status = "canceled";
  } else if (isAwaiting) {
    status = currentStatus!;
  } else if (result.ok) {
    status = "completed";
  } else {
    status = "failed";
  }

  await supabase.from("agent_runs").update({
    status,
    finished_at: isAwaiting ? null : new Date().toISOString(),
    steps: result.steps,
    error: result.error ?? null,
    meta: {
      ...currentMeta,
      summary: result.summary ?? null,
      toolsUsed: result.toolsUsed ?? [],
    },
    ...(result.canceled ? { canceled_at: new Date().toISOString() } : {}),
  }).eq("id", runId);
}

async function drainPendingMessage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  projectId: string,
): Promise<void> {
  const { data: pending } = await supabase
    .from("agent_pending_messages")
    .select("id, conversation_id, user_id, body")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pending) return;

  const body = (pending.body ?? {}) as Record<string, unknown>;

  // Usa acquire_agent_run_lock em vez de INSERT direto
  const { data: lock } = await supabase.rpc("acquire_agent_run_lock", {
    p_project_id: projectId,
    p_conversation_id: pending.conversation_id,
    p_user_id: pending.user_id,
  });
  const lockResult = lock as { acquired?: boolean; run_id?: string } | null;

  if (!lockResult?.acquired || !lockResult?.run_id) {
    logger.warn("agent.drain_lock_failed", { projectId });
    return;
  }

  const msg: AgentChunkMessage = {
    runId: lockResult.run_id,
    projectId,
    conversationId: pending.conversation_id as string,
    userId: pending.user_id as string,
    resume: false,
    accessToken: "",
    body,
  };

  const queued = await enqueueAgentChunk(supabase, msg);
  // Só deleta pending se enfileirou com sucesso
  if (queued) {
    await supabase.from("agent_pending_messages").delete().eq("id", pending.id as string);
    invokeAgentWorker(SUPABASE_URL, SERVICE_KEY).catch(() => {});
  }
}

async function processOneChunk(msg: AgentChunkMessage, msgId: number): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = msg.body ?? {};
  const preferences = body.preferences as AgentPreferencesPayload | undefined;

  const { data: existingStart } = await supabase
    .from("agent_stream_events")
    .select("id")
    .eq("run_id", msg.runId)
    .eq("event_type", "start")
    .limit(1)
    .maybeSingle();
  if (!existingStart) {
    await appendStreamEvent(supabase, msg.runId, "start", {
      type: "start",
      runId: msg.runId,
      projectId: msg.projectId,
      conversationId: msg.conversationId,
      resume: msg.resume,
      serverChunk: true,
    });
  }

  const onEvent = (type: string, data: Record<string, unknown>) => {
    appendStreamEvent(supabase, msg.runId, type, { type, ...data }).catch(() => {});
  };

  // Pre-check: if already finalized OR run doesn't exist, short-circuit without running.
  // This prevents re-execution when PGMQ delete fails silently and the message re-appears.
  const { data: preRun } = await supabase.from("agent_runs").select("id, canceled_at, status").eq("id", msg.runId).maybeSingle();
  if (!preRun || preRun.canceled_at || preRun.status === "canceled" || preRun.status === "completed" || preRun.status === "failed") {
    await deleteAgentChunk(supabase, msgId);
    return;
  }

  const result = await executeAgentJob(supabase, {
    projectId: msg.projectId,
    conversationId: msg.conversationId,
    userId: msg.userId,
    agentRunId: msg.runId,
    resumeRun: msg.resume,
    preferences,
    sessionKindRaw: body.sessionKind as string | undefined,
    enabledSkillIds: normalizeIdList(body.enabledSkillIds),
    enabledMcpIds: normalizeIdList(body.enabledMcpIds),
    // Propaga o flag do caminho barato (se o chunk foi enfileirado com allocateSandbox:false para qualify).
    allocateSandbox: (body as any).allocateSandbox !== false,
  }, onEvent);

  const meta = await supabase.from("agent_runs").select("meta").eq("id", msg.runId).maybeSingle();
  const chunkCount = ((meta.data?.meta as Record<string, unknown>)?.serverChunks as number) ?? 0;

  if (!result.ok && result.resumable && !result.canceled && chunkCount < MAX_SERVER_CHUNKS) {
    await supabase.from("agent_runs").update({
      meta: { ...(meta.data?.meta as object ?? {}), serverChunks: chunkCount + 1 },
    }).eq("id", msg.runId);
    await appendStreamEvent(supabase, msg.runId, "resume", {
      type: "resume",
      chunk: chunkCount + 2,
      message: "Retomando automaticamente no servidor…",
    });
    const requeued = await enqueueAgentChunk(supabase, { ...msg, resume: true });
    if (requeued) {
      invokeAgentWorker(SUPABASE_URL, SERVICE_KEY).catch(() => {});
    } else {
      logger.error("agent.requeue_failed", { runId: msg.runId });
      await finalizeRun(supabase, msg.runId, {
        ok: false, error: "Fila indisponível para continuar execução.", steps: result.steps,
      });
      await appendStreamEvent(supabase, msg.runId, "finish", {
        type: "finish", ok: false, error: "Fila indisponível", resumable: false,
      });
    }
    await deleteAgentChunk(supabase, msgId);
    return;
  }

  await finalizeRun(supabase, msg.runId, result);
  await appendStreamEvent(supabase, msg.runId, "finish", {
    type: "finish",
    ...result,
    resumable: !result.ok && !result.canceled,
  });

  // Heartbeat
  await supabase.from("agent_runs").update({
    heartbeat_at: new Date().toISOString(),
  }).eq("id", msg.runId);

  if (result.ok && !result.canceled) {
    try {
      await drainPendingMessage(supabase, msg.projectId);
    } catch (e) {
      logger.warn("agent.drain_failed", { runId: msg.runId, error: (e as Error).message });
    }
    invokeAgentWorker(SUPABASE_URL, SERVICE_KEY).catch(() => {});
  }

  // Commit: delete chunk after successful processing (read+delete pattern)
  await deleteAgentChunk(supabase, msgId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const item = await readAgentChunk(supabase);

  if (!item) {
    return new Response(JSON.stringify({ ok: true, idle: true }), {
      headers: { ...FORGE_CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    await processOneChunk(item.message, item.msgId);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...FORGE_CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Verificar se o run foi cancelado antes de sobrescrever
    const runId = item.message.runId;
    const { data: current } = await supabase.from("agent_runs")
      .select("canceled_at, status").eq("id", runId).maybeSingle();

    if (current?.canceled_at || current?.status === "canceled") {
      logger.info("agent.run_canceled_during_error", { runId });
      await deleteAgentChunk(supabase, item.msgId);
      return new Response(JSON.stringify({ ok: true, canceled: true }), {
        headers: { ...FORGE_CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const err = e instanceof Error ? e.message : "erro worker";
    const result = { ok: false, error: err, steps: 0 };
    await finalizeRun(supabase, runId, result);
    await appendStreamEvent(supabase, runId, "error", { error: err, recoverable: false });
    await appendStreamEvent(supabase, runId, "finish", { ...result, resumable: false });
    await deleteAgentChunk(supabase, item.msgId);
    return new Response(JSON.stringify({ ok: false, error: err }), { status: 500 });
  }
});