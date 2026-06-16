// ============================================================================
// VIBE AGENT CHAT — Edge Function com SSE dual (chat + inspector)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { executeAgentLoop, updateAgentExecution } from "../_shared/agent-loop.ts";
import { checkIdempotency, getIdempotencyKey, storeIdempotency } from "../_shared/idempotency.ts";
import {
  createPersistentSseReadable,
  fetchConversationEvents,
  type VibeChannel,
} from "../_shared/vibe-agent-sse.ts";
import type { ChatEvent, InspectorEvent } from "../_shared/vibe-agent-events.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);


const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
};

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

      // Rate limiting
      const rateLimitResult = await checkRateLimit(conversation_id);
      if (!rateLimitResult.allowed) {
        return Response.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { ...corsHeaders(), "Retry-After": String(rateLimitResult.retryAfterSeconds) } },
        );
      }

      const executionId = crypto.randomUUID();
      const requestId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();

      await createAgentExecution({
        executionId,
        conversationId: conversation_id,
        requestId,
        model,
        provider,
      });

      const result = {
        execution_id: executionId,
        chat_stream_id: executionId,
        inspector_stream_id: executionId,
      };

      const { writable: chatWritable } = createPersistentMemoryStream<ChatEvent>();
      const { writable: inspectorWritable } = createPersistentMemoryStream<InspectorEvent>();

      try {
        await executeAgentLoop({
          executionId,
          conversationId: conversation_id,
          userMessage: message,
          userId: "system", // TODO: passar do auth
          model,
          provider,
          chatWriter: chatWritable,
          inspectorWriter: inspectorWritable,
          requestId,
          sessionId,
        });
      } catch (err) {
        console.error("[vibe-agent-chat] executeAgentLoop failed:", err);
        await updateAgentExecution(supabase as any, executionId, {
          status: "failed",
          error_message: err instanceof Error ? err.message : "Erro desconhecido",
        });
        throw err;
      } finally {
        closeWriter(chatWritable);
        closeWriter(inspectorWritable);
      }

      await storeIdempotency(idempotencyKey, result);
      return Response.json(result, { headers: corsHeaders() });
    }

    // ─── GET /stream/chat ───
    if (path.endsWith("/stream/chat") && req.method === "GET") {
      const executionId = getExecutionId(url);
      if (!executionId) {
        return new Response("execution_id is required", { status: 400, headers: corsHeaders() });
      }

      const cursor = url.searchParams.get("cursor") || undefined;
      const body = await createPersistentSseReadable(supabase, "chat", executionId, cursor, { signal: req.signal });
      return new Response(body, {
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
      const executionId = getExecutionId(url);
      if (!executionId) {
        return new Response("execution_id is required", { status: 400, headers: corsHeaders() });
      }

      const cursor = url.searchParams.get("cursor") || undefined;
      const body = await createPersistentSseReadable(supabase, "inspector", executionId, cursor, { signal: req.signal });
      return new Response(body, {
        headers: {
          ...corsHeaders(),
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ─── GET /events ───
    if (path.endsWith("/events") && req.method === "GET") {
      const conversationId = url.searchParams.get("conversation_id");
      const channel = (url.searchParams.get("channel") || "inspector") as VibeChannel;
      if (!conversationId || (channel !== "chat" && channel !== "inspector")) {
        return new Response("conversation_id and valid channel are required", { status: 400, headers: corsHeaders() });
      }

      const limit = Number(url.searchParams.get("limit") || 500);
      const events = await fetchConversationEvents(supabase, conversationId, channel, Math.min(limit, 1000));
      return Response.json(events.map((row) => row.event_data || row.payload), { headers: corsHeaders() });
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

async function createAgentExecution(input: {
  executionId: string;
  conversationId: string;
  requestId: string;
  model?: string;
  provider?: string;
}): Promise<void> {
  await (supabase.from("agent_executions" as any) as any).insert({
    id: input.executionId,
    conversation_id: input.conversationId,
    request_id: input.requestId,
    user_id: null,
    model: input.model || null,
    provider: input.provider || null,
    status: "running",
    started_at: new Date().toISOString(),
  });
}

function getExecutionId(url: URL): string | null {
  return url.searchParams.get("execution_id")
    || url.searchParams.get("chat_stream_id")
    || url.searchParams.get("inspector_stream_id")
    || url.searchParams.get("stream_id");
}

function closeWriter(writer: WritableStreamDefaultWriter<unknown>): void {
  try {
    const closeResult = writer.close();
    if (closeResult && typeof closeResult.catch === "function") {
      closeResult.catch(() => {});
    }
  } catch {
    // Ignore close errors after the response has been prepared.
  }
}

function createPersistentMemoryStream<T>(): { readable: ReadableStream<T>; writable: WritableStreamDefaultWriter<T> } {
  let controller: ReadableStreamDefaultController<T>;
  const readable = new ReadableStream<T>({
    start(streamController) {
      controller = streamController;
    },
    cancel(reason) {
      controller.error(reason);
    },
  });

  const writable = new WritableStream<T>({
    write(chunk) {
      controller.enqueue(chunk);
    },
    close() {
      controller.close();
    },
    abort(reason) {
      controller.error(reason);
    },
  });

  return { readable, writable: writable.getWriter() };
}

// ─── DB HELPERS ───
async function applyFlowPatch(conversationId: string, patch: unknown): Promise<unknown> {
  // Get conversation to find flow_id
  const { data: conv, error: convError } = await supabase
    .from("vibe_agent_conversations")
    .select("flow_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    throw new Error("Conversation not found");
  }

  const flowId = (conv as any).flow_id;

  // Get current flow definition
  const { data: flowData, error: flowError } = await supabase
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  if (flowError || !flowData) {
    throw new Error("Flow not found");
  }

  const currentDef = (flowData as any).flow_definition || {};
  const patchData = patch as { nodes?: unknown[]; edges?: unknown[]; changed_node_ids?: string[]; description?: string };

  // Apply patch to flow definition
  const updatedDef = {
    ...currentDef,
    nodes: patchData.nodes || currentDef.nodes || [],
    edges: patchData.edges || currentDef.edges || [],
  };

  // Update agent_flows
  const { error: updateError } = await supabase
    .from("agent_flows")
    .update({
      flow_definition: updatedDef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", flowId);

  if (updateError) {
    throw new Error(`Failed to update flow: ${updateError.message}`);
  }

  // Insert version record
  const { data, error } = await supabase
    .from("agent_flow_versions")
    .insert({
      conversation_id: conversationId,
      flow_id: flowId,
      patch,
      applied_by: "agent",
      metadata: { description: patchData.description || "Patch aplicado pelo Vibe Agent" },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save version: ${error.message}`);
  return data;
}

async function undoFlowVersion(conversationId: string, versionId: string): Promise<unknown> {
  // Get the version to undo
  const { data: version, error: fetchError } = await supabase
    .from("agent_flow_versions")
    .select("patch, flow_id, parent_version_id")
    .eq("id", versionId)
    .eq("conversation_id", conversationId)
    .single();

  if (fetchError || !version) {
    throw new Error("Version not found");
  }

  const versionData = version as any;
  const flowId = versionData.flow_id;

  // Get parent version if exists
  const parentId = versionData.parent_version_id;
  let restorePatch = versionData.patch;

  if (parentId) {
    const { data: parentVersion, error: parentError } = await supabase
      .from("agent_flow_versions")
      .select("patch")
      .eq("id", parentId)
      .single();

    if (!parentError && parentVersion) {
      restorePatch = (parentVersion as any).patch;
    }
  }

  // Apply restore patch to flow
  const { data: flowData, error: flowError } = await supabase
    .from("agent_flows")
    .select("flow_definition")
    .eq("id", flowId)
    .single();

  if (flowError || !flowData) {
    throw new Error("Flow not found");
  }

  const currentDef = (flowData as any).flow_definition || {};
  const patchData = restorePatch as { nodes?: unknown[]; edges?: unknown[] };
  const updatedDef = {
    ...currentDef,
    nodes: patchData.nodes || currentDef.nodes || [],
    edges: patchData.edges || currentDef.edges || [],
  };

  const { error: updateError } = await supabase
    .from("agent_flows")
    .update({
      flow_definition: updatedDef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", flowId);

  if (updateError) {
    throw new Error(`Failed to restore flow: ${updateError.message}`);
  }

  // Insert undo version record
  const { data, error } = await supabase
    .from("agent_flow_versions")
    .insert({
      conversation_id: conversationId,
      flow_id: flowId,
      patch: restorePatch,
      applied_by: "user",
      parent_version_id: versionId,
      metadata: { undo: true },
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save undo version: ${error.message}`);
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
    .insert({ flow_id: flowId, user_id: null, title: `Conversa ${new Date().toLocaleString("pt-BR")}` })
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

async function checkRateLimit(key: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT.windowMs);

  // Get current count
  const { data, error } = await supabase
    .from("rate_limit_counters")
    .select("count, window_start")
    .eq("key", `conv:${key}`)
    .single();

  if (error || !data) {
    // First request in window
    await (supabase.from("rate_limit_counters" as any) as any).insert({
      key: `conv:${key}`,
      count: 1,
      window_start: now.toISOString(),
      updated_at: now.toISOString(),
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const countData = data as { count: number; window_start: string };
  const windowStartDb = new Date(countData.window_start);

  if (windowStartDb < windowStart) {
    // Reset window
    await (supabase.from("rate_limit_counters" as any) as any).upsert({
      key: `conv:${key}`,
      count: 1,
      window_start: now.toISOString(),
      updated_at: now.toISOString(),
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (countData.count >= RATE_LIMIT.maxRequests) {
    const retryAfterSeconds = Math.ceil((windowStartDb.getTime() + RATE_LIMIT.windowMs - now.getTime()) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  // Increment count
  await (supabase.from("rate_limit_counters" as any) as any)
    .update({
      count: countData.count + 1,
      updated_at: now.toISOString(),
    })
    .eq("key", `conv:${key}`);

  return { allowed: true, retryAfterSeconds: 0 };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
  };
}