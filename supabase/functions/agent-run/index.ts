// index.ts — Edge Function agent-run (nova versão com loop faseado)
// Recebe { projectId, conversationId } e roda o AgentLoop com todas as tools
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { ToolRegistry } from "./registry.ts";
import { AgentLoop } from "./loop.ts";
import { createLLMProvider } from "./adapters/llm.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTools } from "./tools/shell.ts";
import { registerGitTools } from "./tools/git.ts";
import { LoopPhase, type AgentState, type ChatMessage } from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Config do LLM (model-agnostic)
const LLM_PROVIDER = Deno.env.get("LLM_PROVIDER") || "claude";     // claude | openai | gemini | openrouter | ollama
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY") || "";
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "claude-sonnet-4-20250514";
const LLM_BASE_URL = Deno.env.get("LLM_BASE_URL") || undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, conversationId } = await req.json();
    if (!projectId || !conversationId) {
      return json({ error: "projectId e conversationId são obrigatórios" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);
    const userId = userData.user.id;

    // Verifica posse do projeto
    const { data: project } = await supabase
      .from("projects")
      .select("id, owner_id")
      .eq("id", projectId)
      .single();
    if (!project || project.owner_id !== userId) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    // Carrega histórico da conversa
    const { data: history } = await supabase
      .from("messages")
      .select("role, parts, tool_calls, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    const messages: ChatMessage[] = (history ?? []).map((m: any) => {
      if (m.role === "user") {
        const text = (m.parts ?? []).map((p: any) => p.text).filter(Boolean).join("\n");
        return { role: "user", content: text || "" };
      }
      if (m.role === "assistant") {
        const text = (m.parts ?? []).map((p: any) => p.text).filter(Boolean).join("\n");
        return {
          role: "assistant",
          content: text || "",
          tool_calls: (m.tool_calls ?? []).map((tc: any) => ({
            id: crypto.randomUUID(),
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
          })),
        };
      }
      return null;
    }).filter(Boolean) as ChatMessage[];

    // ──────── SETUP: ToolRegistry + LLM + Sandbox ────────
    const registry = new ToolRegistry();
    const decider = createLLMProvider({
      provider: LLM_PROVIDER,
      apiKey: LLM_API_KEY,
      baseUrl: LLM_BASE_URL,
      model: LLM_MODEL,
    });
    const sandbox = createSandboxProvider();

    // Registra todas as tools
    registerFsTools(registry, { supabase, projectId });
    registerShellTools(registry, { sandbox, projectId, supabase });
    registerGitTools(registry, { sandbox, projectId, supabase });

    // Adiciona plan_create como meta-tool para o planner
    registry.register(
      {
        name: "plan_create",
        description: "Registra um plano de ação com passos detalhados antes de executar.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Título do plano" },
            steps: { type: "array", items: { type: "string" }, description: "Passos numerados e atômicos" },
            affected_files: { type: "array", items: { type: "string" }, description: "Arquivos que serão afetados" },
          },
          required: ["title", "steps", "affected_files"],
        },
      },
      async (args) => {
        const { error } = await supabase.from("agent_plans").insert({
          project_id: projectId,
          conversation_id: conversationId,
          title: args.title,
          steps: args.steps,
          affected_files: args.affected_files,
        });
        if (error) return { toolCallId: "", ok: false, output: null, error: error.message };
        return { toolCallId: "", ok: true, output: `Plano "${args.title}" registrado com ${(args.steps as any[]).length} passos` };
      },
    );

    // ──────── RUN LOOP ────────
    const initialState: AgentState = {
      projectId,
      conversationId,
      userId,
      messages: [...messages],
      phase: LoopPhase.GATHER_CONTEXT,
      currentStepIndex: 0,
      context: null,
      intent: null,
      plan: null,
      validationResults: [],
      executionLog: [],
      retryFeedback: null,
      totalSteps: 0,
    };

    const loop = new AgentLoop(registry, decider, supabase, initialState);
    const result = await loop.run();

    // Cleanup sandbox
    try { await sandbox.destroy(); } catch { /* ignore */ }

    if (!result.ok) {
      return json({ error: result.error, steps: result.steps }, 500);
    }

    return json({ ok: true, summary: result.summary, steps: result.steps });
  } catch (e: any) {
    console.error("[agent-run] erro:", e);
    return json({ error: e?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
