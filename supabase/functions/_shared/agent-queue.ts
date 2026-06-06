import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logger } from "./logger.ts";

export const AGENT_CHUNKS_QUEUE = "agent_chunks";

export type AgentChunkMessage = {
  runId: string;
  projectId: string;
  conversationId: string;
  userId: string;
  resume: boolean;
  accessToken: string;
  body: Record<string, unknown>;
};

type QueueRow = {
  msg_id: number | string;
  message: AgentChunkMessage;
};

export async function enqueueAgentChunk(
  supabase: SupabaseClient,
  message: AgentChunkMessage,
): Promise<boolean> {
  try {
    const { error } = await supabase.schema("pgmq_public").rpc("send", {
      queue_name: AGENT_CHUNKS_QUEUE,
      message,
      sleep_seconds: 0,
    });
    if (error) {
      logger.warn("agent_queue.send_failed", { runId: message.runId, error: error.message });
      return false;
    }
    return true;
  } catch (e) {
    logger.warn("agent_queue.pgmq_unavailable", { runId: message.runId, error: (e as Error).message });
    return false;
  }
}

export async function readAgentChunk(
  supabase: SupabaseClient,
): Promise<{ msgId: number; message: AgentChunkMessage } | null> {
  try {
    const { data, error } = await supabase.schema("pgmq_public").rpc("read", {
      queue_name: AGENT_CHUNKS_QUEUE,
      sleep_seconds: 0,
      n: 1,
    });
    if (error || !data?.length) return null;
    const row = data[0] as QueueRow;
    const msgId = typeof row.msg_id === "string" ? Number.parseInt(row.msg_id, 10) : row.msg_id;
    return { msgId, message: row.message as AgentChunkMessage };
  } catch {
    return null;
  }
}

export async function deleteAgentChunk(
  supabase: SupabaseClient,
  msgId: number,
): Promise<void> {
  try {
    await supabase.schema("pgmq_public").rpc("delete", {
      queue_name: AGENT_CHUNKS_QUEUE,
      msg_id: msgId,
    });
  } catch {
    /* fila indisponível */
  }
}

export async function invokeAgentWorker(supabaseUrl: string, serviceKey: string): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/functions/v1/agent-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ tick: true }),
    });
  } catch (e) {
    logger.warn("agent_queue.worker_invoke_failed", { error: (e as Error).message });
  }
}