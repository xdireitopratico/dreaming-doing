// index.ts — Edge Function agent-run.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { ToolRegistry } from "./registry.ts";
import { AgentLoop } from "./loop.ts";
import { createSandboxProvider } from "./sandbox.ts";
import { registerFsTools } from "./tools/fs.ts";
import { registerShellTool } from "./tools/shell.ts";
import { LoopPhase, type AgentState } from "./types.ts";
import {
  loadConnectorKeys,
  loadConnectorPools,
  loadDeployConnectorKeys,
  loadForgeTrialRobinPool,
  type AgentPreferencesPayload,
} from "./connector-keys.ts";
import { pickMain, type ProviderConfig } from "./providers.ts";
import {
  defaultRobinModel,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
  resolveModelFromPreferences,
  filterKeysForAutoAllowlist,
} from "../_shared/model-presets.ts";
import { buildStackContext, stackPromptAddon } from "../_shared/stack-context.ts";
import { buildChatHistory } from "./memory.ts";
import { RobinKeyPool, ResilientLLM } from "./robin-pool.ts";
import { loadUserE2bApiKey, E2B_SETUP_USER_MESSAGE } from "../_shared/user-e2b.ts";
import {
  buildSessionExtensionsPrompt,
  normalizeIdList,
} from "../_shared/session-extensions.ts";
import { registerMcpForgeTools } from "./tools/mcp-forge.ts";
import { loadTasteNvidiaConfig, runTasteChat } from "./taste-session.ts";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";

const runningLocks = new Map<string, Promise<unknown>>();

const corsHeaders = FORGE_CORS_HEADERS;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isRobinMode(p?: AgentPreferencesPayload): boolean {
  return p?.mode === "robin" || p?.mode === "rob";
}

function validateAgentPreferences(p?: AgentPreferencesPayload): string | null {
  if (!p?.mode) {
    return "Setup obrigatório: configure modo e modelo em Modelos (/models).";
  }
  if (p.mode === "auto") return null;
  if (p.mode === "fixed" && !p.fixedPresetId?.trim()) {
    return "Setup: selecione um modelo fixo em Modelos (/models).";
  }
  if (isRobinMode(p) && !p.robinPoolModelId?.trim()) {
    return "Setup: selecione o modelo do pool ROBIN em Modelos (/models).";
  }
  if (isRobinMode(p) && !p.poolProvider) {
    return "Setup: selecione o provedor do pool ROBIN (Groq ou NVIDIA).";
  }
  return null;
}

function robinProviderConfig(
  poolProvider: "nvidia" | "groq",
  keys: string[],
  modelPresetId?: string,
): ProviderConfig {
  if (keys.length === 0) {
    throw new Error(
      `Modo ROBIN ativo, mas nenhuma chave ${poolProvider.toUpperCase()} no pool. Adicione chaves em /api → Adicionar ao pool.`,
    );
  }
  const wire = defaultRobinModel(poolProvider, modelPresetId);
  return {
    provider: wire.provider,
    apiKey: keys[0]!,
    model: wire.model,
    baseUrl: wire.baseUrl,
    label: `ROBIN · ${wire.label} (${keys.length} chaves)`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  let projectId: string | undefined;

  try {
    const body = await req.json();
    projectId = body.projectId;
    const conversationId = body.conversationId;
    const preferences = body.preferences as AgentPreferencesPayload | undefined;
    const sessionKindRaw = body.sessionKind as string | undefined;
    const enabledSkillIds = normalizeIdList(body.enabledSkillIds);
    const enabledMcpIds = normalizeIdList(body.enabledMcpIds);
    const sessionExt = await buildSessionExtensionsPrompt(enabledSkillIds, enabledMcpIds);

    if (!projectId || !conversationId) return json({ error: "projectId e conversationId obrigatórios" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const { data: project } = await supabase
      .from("projects").select("id, owner_id, template, meta").eq("id", projectId).single();
    if (!project || project.owner_id !== userData.user.id) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("trial_messages_remaining, taste_chat_remaining, taste_start_remaining, integration_prefs")
      .eq("id", userData.user.id)
      .maybeSingle();

    const tasteChatRemaining =
      typeof profile?.taste_chat_remaining === "number"
        ? profile.taste_chat_remaining
        : typeof profile?.trial_messages_remaining === "number"
          ? profile.trial_messages_remaining
          : 50;
    const tasteStartRemaining =
      typeof profile?.taste_start_remaining === "number" ? profile.taste_start_remaining : 1;

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

    const historyRows = history ?? [];

    const userOnlyKeys = await loadConnectorKeys(supabase, userData.user.id, preferences);
    const groqPool = await loadConnectorPools(supabase, userData.user.id, "groq");
    const nvidiaPool = await loadConnectorPools(supabase, userData.user.id, "nvidia");
    const hasUserLlmKey =
      groqPool.length > 0 ||
      nvidiaPool.length > 0 ||
      Object.keys(userOnlyKeys).some((k) =>
        [
          "ANTHROPIC_API_KEY",
          "GROQ_API_KEY",
          "XAI_API_KEY",
          "OPENAI_API_KEY",
          "NVIDIA_API_KEY",
          "GEMINI_API_KEY",
          "OPENROUTER_API_KEY",
          "DEEPSEEK_API_KEY",
          "DASHSCOPE_API_KEY",
          "MINIMAX_API_KEY",
          "MOONSHOT_API_KEY",
          "MIMO_API_KEY",
          "OLLAMA_BASE_URL",
        ].includes(k)
      );

    type SessionKind = "taste_chat" | "taste_start" | "byok";
    let sessionKind: SessionKind = hasUserLlmKey ? "byok" : "taste_chat";
    if (!hasUserLlmKey && sessionKindRaw === "taste_start") sessionKind = "taste_start";
    if (!hasUserLlmKey && sessionKindRaw === "taste_chat") sessionKind = "taste_chat";
    if (hasUserLlmKey && sessionKindRaw === "taste_start") sessionKind = "taste_start";

    if (sessionKind === "taste_chat" && tasteChatRemaining <= 0) {
      runningLocks.delete(projectId);
      return json({
        error: "Limite Taste Chat (50) atingido. Configure suas API em /api para continuar.",
      }, 402);
    }
    if (sessionKind === "taste_start" && tasteStartRemaining <= 0) {
      runningLocks.delete(projectId);
      return json({
        error: "Start Project já utilizado. Configure API para construir sem limites.",
      }, 402);
    }
    if (!hasUserLlmKey && sessionKind === "byok") {
      runningLocks.delete(projectId);
      return json({
        error: "Configure suas API em /api ou use o Taste Chat / Start Project.",
      }, 402);
    }

    if (sessionKind === "byok") {
      const prefError = validateAgentPreferences(preferences);
      if (prefError) {
        runningLocks.delete(projectId);
        return json({ error: prefError }, 400);
      }
    }

    const acceptSSE = (req.headers.get("Accept") ?? "").includes("text/event-stream");
    const querySSE = new URL(req.url).searchParams.has("sse");
    const useSSE = acceptSSE || querySSE;

    // ─── Taste Chat: concierge NVIDIA, sem agent loop ───
    if (sessionKind === "taste_chat") {
      const cleanup = () => runningLocks.delete(projectId!);
      try {
        const tasteCfg = await loadTasteNvidiaConfig(supabase);
        const run = async (emit: (type: string, data: Record<string, unknown>) => void) => {
          const result = await runTasteChat({
            supabase,
            userId: userData.user.id,
            conversationId,
            cfg: tasteCfg,
            emit,
            sessionAddon: sessionExt.addon,
            enabledSkillIds,
            enabledMcpIds,
            activeSkills: sessionExt.skillNames,
            activeMcps: sessionExt.mcpNames,
          });
          await supabase
            .from("profiles")
            .update({ taste_chat_remaining: Math.max(0, tasteChatRemaining - 1) })
            .eq("id", userData.user.id);
          return result;
        };

        if (!useSSE) {
          const r = await run(() => {});
          cleanup();
          return json(r);
        }

        const stream = new ReadableStream({
          start(controller) {
            const emit = (type: string, data: Record<string, unknown>) => {
              try {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
              } catch { /* closed */ }
            };
            run(emit)
              .then((result) => {
                cleanup();
                emit("finish", { ok: result.ok, summary: result.content, taste: true, sessionKind: "taste_chat" });
                try { controller.close(); } catch { /* */ }
              })
              .catch((err) => {
                cleanup();
                emit("error", { error: (err as Error)?.message });
                emit("finish", { ok: false, error: (err as Error)?.message });
                try { controller.close(); } catch { /* */ }
              });
          },
        });
        return new Response(stream, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      } catch (err: unknown) {
        cleanup();
        return json({ error: (err as Error)?.message ?? "Taste indisponível" }, 500);
      }
    }

    let robinPool: RobinKeyPool | null = null;
    let connectorKeys: Record<string, string> = {};
    let mainCfg: ProviderConfig;
    let effectiveRobin = false;
    let tasteStart = false;
    const userWantsRobin = isRobinMode(preferences);
    const poolProvider = preferences?.poolProvider ?? "groq";

    try {
      if (sessionKind === "taste_start") {
        tasteStart = true;
        const poolKeys = await loadForgeTrialRobinPool(supabase);
        if (poolKeys.length === 0) {
          throw new Error("Start Project: administrador deve configurar pool NVIDIA em API Keys (/api).");
        }
        robinPool = new RobinKeyPool(poolKeys);
        mainCfg = robinProviderConfig("nvidia", poolKeys, PLATFORM_ROBIN_TASTE_PRESET_ID);
        mainCfg.label = `Start Project · Taste · ${mainCfg.label.replace(/^ROBIN · /, "")}`;
        connectorKeys = { NVIDIA_API_KEY: poolKeys[0]! };
        effectiveRobin = true;
        await supabase
          .from("profiles")
          .update({ taste_start_remaining: Math.max(0, tasteStartRemaining - 1) })
          .eq("id", userData.user.id);
      } else if (userWantsRobin) {
        const poolKeys = await loadConnectorPools(supabase, userData.user.id, poolProvider);
        robinPool = new RobinKeyPool(poolKeys);
        mainCfg = robinProviderConfig(poolProvider, poolKeys, preferences?.robinPoolModelId);
        connectorKeys = poolProvider === "nvidia"
          ? { NVIDIA_API_KEY: poolKeys[0]! }
          : { GROQ_API_KEY: poolKeys[0]! };
        effectiveRobin = true;
      } else {
        connectorKeys = { ...userOnlyKeys };
        if (preferences?.mode === "auto") {
          const autoKeys = filterKeysForAutoAllowlist(
            userOnlyKeys,
            preferences?.autoAllowedPresetIds,
            preferences?.userModelEntries,
          );
          mainCfg = pickMain(autoKeys);
          const n = preferences?.autoAllowedPresetIds?.length ?? 0;
          mainCfg.label = `${mainCfg.label} (Auto · ${n > 0 ? `${n} modelo(s)` : "todas as chaves"})`;
        } else {
          const resolved = resolveModelFromPreferences(preferences, userOnlyKeys);
          if (!resolved) {
            throw new Error(
              "Chave ausente para o modelo escolhido. Adicione a API Key do provedor em /api.",
            );
          }
          mainCfg = {
            provider: resolved.provider,
            apiKey: resolved.apiKey,
            model: resolved.model,
            baseUrl: resolved.baseUrl,
            label: `${resolved.label} (fixo)`,
          };
        }
      }
    } catch (err: unknown) {
      runningLocks.delete(projectId);
      return json({ error: (err as Error)?.message ?? "Provider LLM não configurado" }, 500);
    }

    const messages = await buildChatHistory(historyRows, 120, mainCfg.model);

    const reg = new ToolRegistry();
    const e2bKey = await loadUserE2bApiKey(supabase, userData.user.id);
    if (!e2bKey?.trim()) {
      runningLocks.delete(projectId);
      return json({ error: E2B_SETUP_USER_MESSAGE, code: "e2b_not_configured" }, 403);
    }
    const sandbox = createSandboxProvider(e2bKey, undefined, supabase, projectId);
    const projectTemplate = (project as { template?: string }).template ?? "vite-react";
    const projectMeta = ((project as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
    const deployKeys = await loadDeployConnectorKeys(supabase, userData.user.id);
    const stackCtx = buildStackContext(
      profile?.integration_prefs,
      projectMeta,
      { ...connectorKeys, ...deployKeys },
    );
    const stackAddon = stackPromptAddon(stackCtx);
    const cleanup = () => { runningLocks.delete(projectId!); sandbox.destroy().catch(() => {}); };
    registerFsTools(reg, { supabase, projectId });
    registerShellTool(reg, { sandbox, projectId, supabase });
    registerMcpForgeTools(reg, {
      supabase,
      projectId,
      userId: userData.user.id,
      enabledMcpIds,
      deployKeys,
      context7ApiKey: Deno.env.get("CONTEXT7_API_KEY") ?? undefined,
    });

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
      const resilientCheap = resilientMain;

      return new AgentLoop(
        reg,
        resilientMain,
        supabase,
        buildState(),
        (event) => onEvent(event.type, event.data),
        connectorKeys,
        { main: resilientMain, cheap: resilientCheap },
        effectiveRobin,
        projectTemplate,
        stackAddon,
        tasteStart
          ? {
            maxSteps: 14,
            tasteStart: true,
            sessionAddon: sessionExt.addon,
            userSkillNames: sessionExt.skillNames,
          }
          : {
            sessionAddon: sessionExt.addon,
            userSkillNames: sessionExt.skillNames,
          },
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
          robin: effectiveRobin,
          taste: tasteStart,
          sessionKind: tasteStart ? "taste_start" : "byok",
          memoryMessages: messages.length,
          enabledSkillIds,
          enabledMcpIds,
          activeSkills: sessionExt.skillNames,
          activeMcps: sessionExt.mcpNames,
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