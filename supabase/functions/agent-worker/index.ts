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
import type { AgentPreferencesPayload } from "../agent-run/connector-keys.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_SERVER_CHUNKS = 64;

async function finalizeRun(
  supabase: ReturnType<typeof createClient>,
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
  const status = result.canceled ? "canceled" : result.ok ? "completed" : "failed";
  await supabase.from("agent_runs").update({
    status,
    finished_at: new Date().toISOString(),
    steps: result.steps,
    error: result.error ?? null,
    meta: {
      summary: result.summary ?? null,
      toolsUsed: result.toolsUsed ?? [],
    },
    ...(result.canceled ? { canceled_at: new Date().toISOString() } : {}),
  }).eq("id", runId);
}

async function drainPendingMessage(
  supabase: ReturnType<typeof createClient>,
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
  const { data: newRun } = await supabase.from("agent_runs").insert({
    project_id: projectId,
    conversation_id: pending.conversation_id,
    user_id: pending.user_id,
    status: "running",
    meta: { queued: true },
  }).select("id").single();

  if (!newRun?.id) return;

  const msg: AgentChunkMessage = {
    runId: newRun.id,
    projectId,
    conversationId: pending.conversation_id as string,
    userId: pending.user_id as string,
    resume: false,
    accessToken: "",
    body,
  };

  const queued = await enqueueAgentChunk(supabase, msg);
  await supabase.from("agent_pending_messages").delete().eq("id", pending.id);
  if (queued) await invokeAgentWorker(SUPABASE_URL, SERVICE_KEY);
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

  // Pre-check: if already finalized (canceled, completed, failed), short-circuit without running.
  // This prevents re-execution when PGMQ delete fails silently and the message re-appears.
  const { data: preRun } = await supabase.from("agent_runs").select("canceled_at, status").eq("id", msg.runId).maybeSingle();
  if (preRun?.canceled_at || preRun?.status === "canceled" || preRun?.status === "completed" || preRun?.status === "failed") {
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
    const deleted = await deleteAgentChunk(supabase, msgId);
    if (!deleted) {
      await finalizeRun(supabase, msg.runId, { ok: false, error: "PGMQ delete failed", steps: result.steps });
      return;
    }
    await supabase.from("agent_runs").update({
      meta: { ...(meta.data?.meta as object ?? {}), serverChunks: chunkCount + 1 },
    }).eq("id", msg.runId);
    await appendStreamEvent(supabase, msg.runId, "resume", {
      type: "resume",
      chunk: chunkCount + 2,
      message: "Retomando automaticamente no servidor…",
    });
    const requeued = await enqueueAgentChunk(supabase, { ...msg, resume: true });
    if (requeued) await invokeAgentWorker(SUPABASE_URL, SERVICE_KEY);
    return;
  }

  const deleted = await deleteAgentChunk(supabase, msgId);
  if (!deleted) {
    await finalizeRun(supabase, msg.runId, { ok: false, error: "PGMQ delete failed", steps: result.steps });
    return;
  }
  await finalizeRun(supabase, msg.runId, result);
  await appendStreamEvent(supabase, msg.runId, "finish", {
    type: "finish",
    ...result,
    resumable: !result.ok && !result.canceled,
  });

  if (result.ok && !result.canceled) {
    await drainPendingMessage(supabase, msg.projectId);
    await invokeAgentWorker(SUPABASE_URL, SERVICE_KEY);
  }
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
    const err = e instanceof Error ? e.message : "erro worker";
    await appendStreamEvent(supabase, item.message.runId, "error", { error: err, recoverable: true });
    await appendStreamEvent(supabase, item.message.runId, "finish", { ok: false, error: err, resumable: true });
    await deleteAgentChunk(supabase, item.msgId);
    return new Response(JSON.stringify({ ok: false, error: err }), { status: 500 });
  }
});