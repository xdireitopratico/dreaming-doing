/**
 * vibe-agent-chat — Chat do Vibe Agent no Flow Builder (isolado do boardroom)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createVibeConversation,
  listVibeConversations,
  loadVibeMessages,
  sendVibeAgentMessage,
} from "../_shared/vibe-agent-chat.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type VibeAgentRequest = {
  action: "create_conversation" | "list_conversations" | "load_messages" | "send_message";
  flow_id?: string;
  conversation_id?: string;
  message?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const body: VibeAgentRequest = await req.json();
    let result: unknown;

    switch (body.action) {
      case "create_conversation": {
        if (!body.flow_id) {
          return new Response(JSON.stringify({ error: "flow_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        const created = await createVibeConversation(user.id, body.flow_id);
        const messages = await loadVibeMessages(created.conversation_id, user.id);
        result = { ...created, messages };
        break;
      }

      case "list_conversations": {
        if (!body.flow_id) {
          return new Response(JSON.stringify({ error: "flow_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        result = { conversations: await listVibeConversations(user.id, body.flow_id) };
        break;
      }

      case "load_messages": {
        if (!body.conversation_id) {
          return new Response(JSON.stringify({ error: "conversation_id required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        result = { messages: await loadVibeMessages(body.conversation_id, user.id) };
        break;
      }

      case "send_message": {
        if (!body.conversation_id || !body.message?.trim()) {
          return new Response(JSON.stringify({ error: "conversation_id and message required" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }
        result = await sendVibeAgentMessage(user.id, body.conversation_id, body.message);
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[vibe-agent-chat] Error:", err);
    const errMsg = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});