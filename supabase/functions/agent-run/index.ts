// index.ts — Edge Function agent-run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { ToolRegistry } from "./registry.ts";
import { AgentLoop } from "./loop.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTool } from "./tools/shell.ts";
import { LoopPhase, type AgentState } from "./types.ts";
import { loadConnectorKeys, loadConnectorPools, type AgentPreferencesPayload } from "./connector-keys.ts";
import { pickCheap, pickMain, type ProviderConfig } from "./providers.ts";
import { buildChatHistory } from "./memory.ts";
import { RobinKeyPool, ResilientLLM } from "./robin-pool.ts";

const runningLocks = new Map<string, Promise<unknown>>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isRobinMode(p?: AgentPreferencesPayload): boolean {
  return p?.mode === "robin" || p?.mode === "rob";
}

function robinProviderConfig(poolProvider: "nvidia" | "groq", keys: string[]): ProviderConfig {
  if (keys.length === 0) {
    throw new Error(
      `Modo ROBIN ativo, mas nenhuma chave ${poolProvider.toUpperCase()} no pool. Adicione chaves em /api-keys → Adicionar ao pool.`,
    );
  }
  if (poolProvider === "nvidia") {
    return {
      provider: "openai",
      apiKey: keys[0]!,
      model: "meta/llama-3.1-8b-instruct",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      label: `ROBIN · NVIDIA NIM (${keys.length} chaves)`,
    };
  }
  return {
    provider: "openai",
    apiKey: keys[0]!,
    model: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    label: `ROBIN · Groq (${keys.length} chaves)`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let projectId: string | undefined;

  try {
    const body = await req.json();
    projectId = body.projectId;
    const conversationId = body.conversationId;
    const preferences = body.preferences as AgentPreferencesPayload | undefined;

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

    if (runningLocks.has(projectId)) {
      return json({ error: "Agente já está executando neste projeto. Aguarde a conclusão." }, 409);
    }
    runningLocks.set(projectId, Promise.resolve());

    const { data: history } = await supabase
      .from("messages")
      .select("role, parts, tool_calls, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(120);

    const messages = buildChatHistory(history ?? []);

    const robin = isRobinMode(preferences);
    const poolProvider = preferences?.poolProvider ?? "groq";
    let robinPool: RobinKeyPool | null = null;
    let connectorKeys: Record<string, string> = {};
    let mainCfg: ProviderConfig;

    try {
      if (robin) {
        const poolKeys = await loadConnectorPools(supabase, userData.user.id, poolProvider);
        robinPool = new RobinKeyPool(poolKeys);
        mainCfg = robinProviderConfig(poolProvider, poolKeys);
        connectorKeys = poolProvider === "nvidia"
          ? { NVIDIA_API_KEY: poolKeys[0]! }
          : { GROQ_API_KEY: poolKeys[0]! };
      } else {
        connectorKeys = await loadConnectorKeys(supabase, userData.user.id, preferences);
      }

      if (!robin) {
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
      }
    } catch (err: unknown) {
      runningLocks.delete(projectId);
      return json({ error: (err as Error)?.message ?? "Provider LLM não configurado" }, 500);
    }

    const reg = new ToolRegistry();
    const sandbox = createSandboxProvider();
    const cleanup = () => { runningLocks.delete(projectId!); sandbox.destroy().catch(() => {}); };
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

    const makeLoop = (onEvent: (type: string, data: unknown) => void) => {
      const streamEmit = (type: string, data: Record<string, unknown>) => onEvent(type, data);
      const resilientMain = new ResilientLLM(mainCfg, robinPool, streamEmit);
      const cheapCfg = robin ? mainCfg : pickCheap(pickMain(connectorKeys), connectorKeys);
      const resilientCheap = robin
        ? resilientMain
        : new ResilientLLM(cheapCfg, null, streamEmit);

      return new AgentLoop(
        reg,
        resilientMain,
        supabase,
        buildState(),
        (event) => onEvent(event.type, event.data),
        connectorKeys,
        { main: resilientMain, cheap: resilientCheap },
        robin,
      );
    };

    if (!useSSE) {
      const loop = makeLoop(() => {});
      const result = await loop.run();
      cleanup();
      return json(result);
    }

    const stream = new ReadableStream({
      start(controller) {
        const emit = (data: Record<string, unknown>) => {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        };

        emit({
          type: "start",
          projectId,
          conversationId,
          provider: mainCfg.label,
          robin,
          memoryMessages: messages.length,
        });

        const loop = makeLoop((type, data) => emit({ type, data }));

        loop.run().then((result) => {
          cleanup();
          emit({ type: "finish", ...result, resumable: !result.ok });
          try { controller.close(); } catch { /* closed */ }
        }).catch((err) => {
          cleanup();
          emit({
            type: "error",
            error: err?.message ?? "erro desconhecido",
            recoverable: true,
            message: "Conexão interrompida. Histórico salvo — use Continuar no editor.",
          });
          emit({ type: "finish", ok: false, error: err?.message, resumable: true });
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
  } catch (e: unknown) {
    if (projectId) runningLocks.delete(projectId);
    return json({ error: (e as Error)?.message ?? "erro inesperado" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}