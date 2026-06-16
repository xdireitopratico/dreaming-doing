// ============================================================================
// VIBE AGENT CHAT — Edge Function com SSE dual (chat + inspector)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { executeAgentLoop } from "../_shared/agent-loop.ts";
import { checkIdempotency, getIdempotencyKey, storeIdempotency } from "../_shared/idempotency.ts";
import type { ChatEvent, InspectorEvent } from "../_shared/vibe-agent-events.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface StreamRecord {
  chatWriter: WritableStreamDefaultWriter<ChatEvent>;
  inspectorWriter: WritableStreamDefaultWriter<InspectorEvent>;
  createdAt: number;
}

const streamRegistry = new Map<string, StreamRecord>();

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  try {
    // ─── POST /execute ───
    if (path.endsWith("/execute") && req.method === "POST") {
      const idempotencyKey = getIdempotencyKey(req);
      const cached = await checkIdempotency(idempotencyKey);
      if (cached) {
        return Response.json(cached, { headers: corsHeaders() });
      }

      const { conversation_id, message, model, provider } = await req.json();
      if (!conversation_id || !message) {
        return Response.json({ error: "conversation_id and message are required" }, { status: 400, headers: corsHeaders() });
      }

      const chatStreamId = crypto.randomUUID();
      const inspectorStreamId = crypto.randomUUID();
      const requestId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      const { readable: chatReadable, writable: chatWritable } = createSSEStream<ChatEvent>();
      const { readable: inspectorReadable, writable: inspectorWritable } = createSSEStream<InspectorEvent>();

      streamRegistry.set(chatStreamId, {
        chatWriter: chatWritable,
        inspectorWriter: inspectorWritable,
        createdAt: Date.now(),
      });

      // Execute in background
      executeAgentLoop({
        conversationId: conversation_id,
        userMessage: message,
        userId: "system", // TODO: passar do auth
        model,
        provider,
        chatWriter: chatWritable,
        inspectorWriter: inspectorWritable,
        requestId,
        sessionId,
      }).catch((err) => {
        console.error("[vibe-agent-chat] executeAgentLoop failed:", err);
        chatWritable.write({
          type: "chat_error",
          code: "EXECUTION_FAILED",
          message: err instanceof Error ? err.message : "Erro desconhecido",
          recoverable: true,
          timestamp: Date.now(),
          requestId,
        }).catch(() => {});
      }).finally(() => {
        chatWritable.close().catch(() => {});
        inspectorWritable.close().catch(() => {});
        streamRegistry.delete(chatStreamId);
      });

      const result = { chat_stream_id: chatStreamId, inspector_stream_id: inspectorStreamId };
      await storeIdempotency(idempotencyKey, result);

      return Response.json(result, { headers: corsHeaders() });
    }

    // ─── GET /stream/chat ───
    if (path.endsWith("/stream/chat") && req.method === "GET") {
      const streamId = url.searchParams.get("stream_id");
      if (!streamId) {
        return new Response("stream_id is required", { status: 400, headers: corsHeaders() });
      }

      const record = streamRegistry.get(streamId);
      if (!record) {
        return new Response("Stream not found", { status: 404, headers: corsHeaders() });
      }

      return new Response(record.chatWriter as unknown as ReadableStream, {
        headers: {
          ...corsHeaders(),
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ─── GET /stream/inspector ───
    if (path.endsWith("/stream/inspector") && req.method === "GET") {
      const streamId = url.searchParams.get("stream_id");
      if (!streamId) {
        return new Response("stream_id is required", { status: 400, headers: corsHeaders() });
      }

      const record = streamRegistry.get(streamId);
      if (!record) {
        return new Response("Stream not found", { status: 404, headers: corsHeaders() });
      }

      return new Response(record.inspectorWriter as unknown as ReadableStream, {
        headers: {
          ...corsHeaders(),
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ─── POST /apply-patch ───
    if (path.endsWith("/apply-patch") && req.method === "POST") {
      const { conversation_id, patch } = await req.json();
      if (!conversation_id || !patch) {
        return Response.json({ error: "conversation_id and patch are required" }, { status: 400, headers: corsHeaders() });
      }

      const version = await applyFlowPatch(conversation_id, patch);
      return Response.json(version, { headers: corsHeaders() });
    }

    // ─── POST /undo ───
    if (path.endsWith("/undo") && req.method === "POST") {
      const { conversation_id, version_id } = await req.json();
      if (!conversation_id || !version_id) {
        return Response.json({ error: "conversation_id and version_id are required" }, { status: 400, headers: corsHeaders() });
      }

      const version = await undoFlowVersion(conversation_id, version_id);
      return Response.json(version, { headers: corsHeaders() });
    }

    // ─── GET /history ───
    if (path.endsWith("/history") && req.method === "GET") {
      const conversation_id = url.searchParams.get("conversation_id");
      if (!conversation_id) {
        return new Response("conversation_id is required", { status: 400, headers: corsHeaders() });
      }

      const versions = await getFlowHistory(conversation_id);
      return Response.json(versions, { headers: corsHeaders() });
    }

    // ─── CONVERSATION MANAGEMENT ───
    if (path.endsWith("/conversations") && req.method === "POST") {
      const { flow_id } = await req.json();
      if (!flow_id) {
        return Response.json({ error: "flow_id is required" }, { status: 400, headers: corsHeaders() });
      }

      const conversation = await createConversation(flow_id);
      return Response.json(conversation, { headers: corsHeaders() });
    }

    if (path.endsWith("/conversations") && req.method === "GET") {
      const flow_id = url.searchParams.get("flow_id");
      if (!flow_id) {
        return new Response("flow_id is required", { status: 400, headers: corsHeaders() });
      }

      const conversations = await listConversations(flow_id);
      return Response.json(conversations, { headers: corsHeaders() });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders() });

  } catch (err) {
    console.error("[vibe-agent-chat]", err);
    return Response.json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, { status: 500, headers: corsHeaders() });
  }
});

// ─── DB HELPERS ───
async function applyFlowPatch(conversationId: string, patch: unknown): Promise<unknown> {
  const { data, error } = await supabase
    .from("agent_flow_versions")
    .insert({
      conversation_id: conversationId,
      patch,
      applied_by: "agent",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to apply patch: ${error.message}`);
  return data;
}

async function undoFlowVersion(conversationId: string, versionId: string): Promise<unknown> {
  const { data: version, error: fetchError } = await supabase
    .from("agent_flow_versions")
    .select("patch")
    .eq("id", versionId)
    .eq("conversation_id", conversationId)
    .single();

  if (fetchError || !version) {
    throw new Error("Version not found");
  }

  const { data, error } = await supabase
    .from("agent_flow_versions")
    .insert({
      conversation_id: conversationId,
      patch: version.patch,
      applied_by: "user",
      parent_version_id: versionId,
      metadata: { undo: true },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to undo: ${error.message}`);
  return data;
}

async function getFlowHistory(conversationId: string): Promise<unknown> {
  const { data, error } = await supabase
    .from("agent_flow_versions")
    .select()
    .eq("conversation_id", conversationId)
    .order("applied_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch history: ${error.message}`);
  return data || [];
}

async function createConversation(flowId: string): Promise<unknown> {
  const { data, error } = await supabase
    .from("vibe_agent_conversations")
    .insert({ flow_id: flowId, title: `Conversa ${new Date().toLocaleString("pt-BR")}` })
    .select()
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data;
}

async function listConversations(flowId: string): Promise<unknown> {
  const { data, error } = await supabase
    .from("vibe_agent_conversations")
    .select()
    .eq("flow_id", flowId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  return data || [];
}

// ─── SSE HELPER ───
function createSSEStream<T>(): { readable: ReadableStream<T>; writable: WritableStreamDefaultWriter<T> } {
  let writer: WritableStreamDefaultWriter<T>;
  const readable = new ReadableStream<T>({
    start(controller) {
      writer = controller as unknown as WritableStreamDefaultWriter<T>;
    },
    cancel() {
      // Client disconnected
    },
  });
  return { readable, writable: writer! };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
  };
}