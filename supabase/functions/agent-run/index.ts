// index.ts — Edge Function agent-run v3 (DEFINITIVO)
// Model Router + Compression + Parallel Exec + Runtime Observer + Skills + SSE
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { ToolRegistry } from "./registry.ts";
import { AgentLoop } from "./loop.ts";
import { createLLMProvider } from "./adapters/llm.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTool } from "./tools/shell.ts";
import { SkillRegistry } from "./skills.ts";
import { LoopPhase, type AgentState, type ChatMessage } from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LLM_PROVIDER = Deno.env.get("LLM_PROVIDER") || "openai";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") || "";
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "gpt-4o";
const LLM_BASE_URL = Deno.env.get("LLM_BASE_URL") || undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, conversationId } = await req.json();
    if (!projectId || !conversationId) return json({ error: "projectId e conversationId obrigatórios" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const { data: project } = await supabase
      .from("projects").select("id, owner_id").eq("id", projectId).single();
    if (!project || project.owner_id !== userData.user.id) return json({ error: "Projeto não encontrado" }, 404);

    // Histórico
    const { data: history } = await supabase
      .from("messages")
      .select("role, parts, tool_calls")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    const messages: ChatMessage[] = (history ?? []).map((m: any) => {
      const text = (m.parts ?? []).map((p: any) => p.text).filter(Boolean).join("\n");
      if (m.role === "tool") return { role: "tool", tool_call_id: "", content: text };
      return {
        role: m.role,
        content: text || "",
        tool_calls: (m.tool_calls ?? []).map((tc: any) => ({
          id: crypto.randomUUID(),
          type: "function" as const,
          function: { name: tc.name, arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}) },
        })),
      };
    });

    // ─── Setup: 6 ferramentas ───
    const reg = new ToolRegistry();
    const llm = createLLMProvider({ provider: LLM_PROVIDER, apiKey: LLM_API_KEY, model: LLM_MODEL, baseUrl: LLM_BASE_URL });
    const sandbox = createSandboxProvider();

    registerFsTools(reg, { supabase, projectId });
    registerShellTool(reg, { sandbox, projectId, supabase });

    // ─── SSE Stream ───
    const stream = new ReadableStream({
      start(controller) {
        const emit = (data: any) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        const state: AgentState = {
          projectId, conversationId, userId: userData.user.id,
          messages: [...messages],
          phase: LoopPhase.GATHER_CONTEXT,
          currentStepIndex: 0,
          context: null, intent: null, plan: null,
          validationResults: [], executionLog: [], retryFeedback: null, totalSteps: 0,
        };

        emit({ type: "start", projectId, conversationId });

        const loop = new AgentLoop(reg, llm, supabase, state, (event) => emit(event));
        loop.run().then((result) => {
          emit({ type: "finish", ...result });
          sandbox.destroy().catch(() => {});
          controller.close();
        }).catch((err) => {
          emit({ type: "error", error: err.message });
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    });
  } catch (e: any) {
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
