// index.ts — Edge Function agent-run.
// Auto-detecta provider (Anthropic > xAI > Lovable AI > OpenAI), SSE + JSON fallback.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { ToolRegistry } from "./registry.ts";
import { AgentLoop } from "./loop.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTool } from "./tools/shell.ts";
import { LoopPhase, type AgentState, type ChatMessage } from "./types.ts";
import { loadConnectorKeys } from "./connector-keys.ts";
import { buildProvider, pickMain } from "./providers.ts";

// Simple in-memory advisory lock per project (Edge Function realm — resets on cold start)
const runningLocks = new Map<string, Promise<unknown>>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, conversationId, preferences } = await req.json();
    if (!projectId || !conversationId) return json({ error: "projectId e conversationId obrigatórios" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const { data: project } = await supabase
      .from("projects").select("id, owner_id").eq("id", projectId).single();
    if (!project || project.owner_id !== userData.user.id) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    // Advisory lock — prevents concurrent agent runs for the same project
    if (runningLocks.has(projectId)) {
      return json({ error: "Agente já está executando neste projeto. Aguarde a conclusão." }, 409);
    }
    runningLocks.set(projectId, Promise.resolve());

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
          id: tc.id ?? crypto.randomUUID(),
          type: "function" as const,
          function: { name: tc.name, arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}) },
        })),
      };
    });

    const connectorKeys = await loadConnectorKeys(supabase, userData.user.id, preferences);

    let mainCfg;
    try {
      if (preferences?.mode === "fixed" && preferences.fixedPresetId) {
        const preset = preferences.fixedPresetId as string;
        if (preset.includes("groq") && connectorKeys.GROQ_API_KEY) {
          mainCfg = {
            provider: "openai",
            apiKey: connectorKeys.GROQ_API_KEY,
            model: "llama-3.3-70b-versatile",
            baseUrl: "https://api.groq.com/openai/v1",
            label: "Groq (fixo)",
          };
        } else if (preset.includes("xai") && connectorKeys.XAI_API_KEY) {
          mainCfg = {
            provider: "openai",
            apiKey: connectorKeys.XAI_API_KEY,
            model: "grok-2-1212",
            baseUrl: "https://api.x.ai/v1",
            label: "xAI (fixo)",
          };
        } else if (preset.includes("openai") && connectorKeys.OPENAI_API_KEY) {
          mainCfg = {
            provider: "openai",
            apiKey: connectorKeys.OPENAI_API_KEY,
            model: "gpt-4o",
            label: "OpenAI (fixo)",
          };
        } else {
          mainCfg = pickMain(connectorKeys);
        }
      } else {
        mainCfg = pickMain(connectorKeys);
      }
    } catch (err: any) {
      return json({ error: err?.message ?? "Provider LLM não configurado" }, 500);
    }
    const llm = buildProvider(mainCfg);

    const reg = new ToolRegistry();
    const sandbox = createSandboxProvider();
    const cleanup = () => { runningLocks.delete(projectId); sandbox.destroy().catch(() => {}); };
    registerFsTools(reg, { supabase, projectId });
    registerShellTool(reg, { sandbox, projectId, supabase });

    const acceptSSE = (req.headers.get("Accept") ?? "").includes("text/event-stream");
    const querySSE = new URL(req.url).searchParams.has("sse");
    const useSSE = acceptSSE || querySSE;

    const buildState = (): AgentState => ({
      projectId, conversationId, userId: userData.user.id,
      messages: [...messages],
      phase: LoopPhase.GATHER_CONTEXT,
      currentStepIndex: 0,
      context: null, intent: null, plan: null,
      validationResults: [], executionLog: [], retryFeedback: null, totalSteps: 0,
    });

    if (!useSSE) {
      const loop = new AgentLoop(reg, llm, supabase, buildState(), () => {}, connectorKeys);
      const result = await loop.run();
      cleanup();
      return json(result);
    }

    const stream = new ReadableStream({
      start(controller) {
        const emit = (data: any) => {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        };

        emit({ type: "start", projectId, conversationId, provider: mainCfg.label });

        const loop = new AgentLoop(reg, llm, supabase, buildState(), (event) => emit(event), connectorKeys);
        loop.run().then((result) => {
          cleanup();
          emit({ type: "finish", ...result });
          try { controller.close(); } catch { /* closed */ }
        }).catch((err) => {
          cleanup();
          emit({ type: "error", error: err?.message ?? "erro desconhecido" });
          try { controller.close(); } catch { /* closed */ }
        });
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e: any) {
    runningLocks.delete(projectId);
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
