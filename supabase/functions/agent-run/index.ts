// index.ts — Edge Function agent-run (build: agentloop-only 2026-06-06).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { createSandboxProvider } from "./sandbox.ts";
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
import { registerDeployTool } from "./tools/deploy.ts";
import { loadTasteNvidiaConfig, runTasteChat } from "./taste-session.ts";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";
import { logger, withCorrelationId, correlationIdFromRequest, currentCorrelationId } from "../_shared/logger.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { appendStreamEvent, fetchStreamEventsSince } from "../_shared/agent-stream.ts";
import { executeAgentJob } from "./run-job.ts";
import type { ExecuteParams } from "./run-executor.ts";
const runningLocks = new Map<string, Promise<unknown>>();

const corsHeaders = FORGE_CORS_HEADERS;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INNGEST_EVENT_KEY = Deno.env.get("INNGEST_EVENT_KEY") ?? "";

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
  const correlationId = correlationIdFromRequest(req);

  return await withCorrelationId(correlationId, async () => {
  let projectId: string | undefined;

  try {
    const body = await req.json();

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const isServiceCall = token === SERVICE_KEY;

    // P0: Inngest → execute bypasses user auth (service role).
    if (body.action === "execute") {
      if (!isServiceCall) {
        return json({ error: "execute requer service role" }, 403);
      }
      const { executeAgentRun } = await import("./run-executor.ts");
      const {
        runId: eRunId,
        projectId: eProjectId,
        conversationId: eConvId,
        userId: eUserId,
        preferences: ePrefs,
        sessionKind: eSession,
        enabledSkillIds: eSkills,
        enabledMcpIds: eMcps,
        planMode: ePlanMode,
        plan: ePlan,
        planSourceRunId: ePlanSrc,
        resume: eResume,
      } = body as Record<string, unknown>;

      if (!eRunId || !eProjectId || !eConvId || !eUserId) {
        return json({ error: "runId, projectId, conversationId, userId obrigatórios" }, 400);
      }

      projectId = String(eProjectId);
      logger.info("agent_run.execute", {
        runId: String(eRunId),
        projectId,
        userId: String(eUserId),
        planMode: ePlanMode === true,
      });

      const result = await executeAgentRun(supabase, {
        runId: String(eRunId),
        projectId: String(eProjectId),
        conversationId: String(eConvId),
        userId: String(eUserId),
        preferences: (ePrefs as ExecuteParams["preferences"]) ?? null,
        sessionKindRaw: typeof eSession === "string" ? eSession : null,
        enabledSkillIds: Array.isArray(eSkills) ? (eSkills as string[]) : [],
        enabledMcpIds: Array.isArray(eMcps) ? (eMcps as string[]) : [],
        resume: eResume === true,
        planMode: ePlanMode === true,
        plan: typeof ePlan === "string" ? ePlan : undefined,
        planSourceRunId: typeof ePlanSrc === "string" ? ePlanSrc : undefined,
      });

      return json(result);
    }

    const { data: userData, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    logger.info("agent_run.request", {
      projectId,
      userId: userData.user.id,
      action: typeof body.action === "string" ? body.action : "run",
    });

    if (body.action === "cancel") {
      const runId = body.runId as string | undefined;
      if (!runId) return json({ error: "runId obrigatório" }, 400);

      const { data: run } = await supabase
        .from("agent_runs")
        .select("id, user_id, status, canceled_at, project_id")
        .eq("id", runId)
        .maybeSingle();

      if (!run || run.user_id !== userData.user.id) {
        return json({ error: "Run não encontrada" }, 404);
      }
      if (run.status === "canceled" || run.canceled_at) {
        return json({ ok: true, already: true });
      }
      if (run.status === "completed" || run.status === "failed") {
        return json({ ok: true, already: true, status: run.status });
      }

      const now = new Date().toISOString();
      await supabase
        .from("agent_runs")
        .update({
          status: "canceled",
          canceled_at: now,
          finished_at: now,
        })
        .eq("id", runId);

      // Also clear any queued pending messages for this project so stop truly stops the chain
      await supabase
        .from("agent_pending_messages")
        .delete()
        .eq("project_id", run.project_id ?? projectId)
        .eq("user_id", userData.user.id);

      return json({ ok: true });
    }

    projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const conversationId = body.conversationId;
    const preferences = body.preferences as AgentPreferencesPayload | undefined;
    const sessionKindRaw = body.sessionKind as string | undefined;
    const tasteActionRaw = body.tasteAction as string | undefined;
    const resumeRun = body.resume === true;
    const autoResume = body.autoResume === true;
    // Fase 4.7: modo vem do dropdown do cliente (Chat/Plan/Build).
    // - "chat" (default): sem plano, sem gate, agente decide
    // - "plan": agente propõe plano e pausa pra aprovação
    // - "build": sinônimo de plan neste momento (UX)
    // Sem magic defaults: se o cliente não mandar 'mode', é 'chat'.
    const modeRaw = typeof body.mode === "string" ? body.mode.toLowerCase() : "chat";
    const mode: "chat" | "plan" | "build" =
      modeRaw === "plan" || modeRaw === "build" ? modeRaw : "chat";
    const planMode = mode !== "chat";
    const enabledSkillIds = normalizeIdList(body.enabledSkillIds);
    const enabledMcpIds = normalizeIdList(body.enabledMcpIds);
    const sessionExt = await buildSessionExtensionsPrompt(enabledSkillIds, enabledMcpIds);

    if (!projectId || !conversationId) return json({ error: "projectId e conversationId obrigatórios" }, 400);

    const acceptSSE = (req.headers.get("Accept") ?? "").includes("text/event-stream");
    const querySSE = new URL(req.url).searchParams.has("sse");
    const useSSE = acceptSSE || querySSE;

    const { data: project } = await supabase
      .from("projects").select("id, owner_id, template, meta").eq("id", projectId).single();
    if (!project || project.owner_id !== userData.user.id) {
      return json({ error: "Projeto não encontrado" }, 404);
    }

    // Fase 4.7: checa se o projeto tem arquivos ANTES de alocar E2B.
    // Sandbox E2B só nasce DEPOIS do agente criar o primeiro arquivo (ou seja,
    // DEPOIS de pelo menos um fs_write/fs_edit ter acontecido). Projeto vazio
    // => conversa pura => sem sandbox => sem preview iframe.
    let projectFileCount = 0;
    try {
      const { count } = await supabase
        .from("project_files")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId);
      projectFileCount = count ?? 0;
    } catch {
      // Se a tabela não tem RLS adequado, fallback = 0 (não aloca).
      projectFileCount = 0;
    }

    if (body.action === "watch") {
      const runId = body.runId as string | undefined;
      if (!runId) return json({ error: "runId obrigatório" }, 400);
      const { data: run } = await supabase
        .from("agent_runs")
        .select("id, user_id, project_id, status")
        .eq("id", runId)
        .maybeSingle();
      if (!run || run.user_id !== userData.user.id || run.project_id !== projectId) {
        return json({ error: "Run não encontrada" }, 404);
      }
      if (!useSSE) return json({ error: "Accept: text/event-stream obrigatório" }, 400);
      return streamEventsResponse(supabase, runId, () => {});
    }

    if (body.action === "replay") {
      const runId = body.runId as string | undefined;
      if (!runId) return json({ error: "runId obrigatório" }, 400);
      const { data: run } = await supabase
        .from("agent_runs")
        .select("id, user_id, project_id, status, error, steps, meta")
        .eq("id", runId)
        .maybeSingle();
      if (!run || run.user_id !== userData.user.id || run.project_id !== projectId) {
        return json({ error: "Run não encontrada" }, 404);
      }
      if (!useSSE) return json({ error: "Accept: text/event-stream obrigatório" }, 400);

      // Re-emite todos os eventos do run em ordem, com pequeno delay pra simular live.
      // Útil pra debug sem rerun (LLM é não-determinístico — replay fiel de I/O, não de inferência).
      const { data: events } = await supabase
        .from("agent_stream_events")
        .select("seq, event_type, payload")
        .eq("run_id", runId)
        .order("seq", { ascending: true })
        .limit(2000);

      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          const write = (data: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
          write({ type: "replay_start", runId, totalEvents: events?.length ?? 0 });

          for (const evt of events ?? []) {
            write({ type: evt.event_type, data: evt.payload, seq: evt.seq, replayed: true });
            // Throttle: 10ms entre eventos pra não saturar o browser
            await new Promise((r) => setTimeout(r, 10));
          }

          write({
            type: "finish",
            ok: run.status === "completed",
            error: run.error ?? null,
            resumable: false,
            replayed: true,
          });
          controller.close();
        },
      });

      logger.event("agent_run.replay", { runId, eventsCount: events?.length ?? 0 });
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    if (body.action === "pending_count") {
      const { count } = await supabase
        .from("agent_pending_messages")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("user_id", userData.user.id);
      return json({ pendingCount: count ?? 0 });
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

    const { data: activeRun } = await supabase
      .from("agent_runs")
      .select("id, status, meta")
      .eq("project_id", projectId)
      .in("status", ["running", "awaiting_user"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback: buscar runs completed que têm awaitingUser no meta
    // (cobre dados históricos corrompidos pelo bug do finalizeRun)
    let awaitingRun = activeRun;
    if (!awaitingRun) {
      const { data: completedAwaiting } = await supabase
        .from("agent_runs")
        .select("id, status, meta")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .not("meta->awaitingUser", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (completedAwaiting) {
        awaitingRun = completedAwaiting;
        // Corrigir o status para refletir a realidade
        await supabase.from("agent_runs")
          .update({ status: "awaiting_user", finished_at: null })
          .eq("id", completedAwaiting.id);
      }
    }

    const latestMeta = (awaitingRun?.meta ?? {}) as Record<string, unknown>;
    const isAwaiting = awaitingRun?.status === "awaiting_user" || !!latestMeta.awaitingUser;

    // Se o run está ativamente rodando (não apenas esperando), enfileira.
    // Se está awaiting_user, NÃO enfileira — cria run de continuação.
    const isRunning = awaitingRun?.status === "running" || runningLocks.has(projectId);

    if (isRunning && !resumeRun && !isAwaiting) {
      await supabase.from("agent_pending_messages").insert({
        project_id: projectId,
        conversation_id: conversationId,
        user_id: userData.user.id,
        body: {
          preferences,
          sessionKind: sessionKindRaw,
          enabledSkillIds,
          enabledMcpIds,
          allocateSandbox: true,
        },
      });
      const { count } = await supabase
        .from("agent_pending_messages")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("user_id", userData.user.id);
      const pendingCount = count ?? 1;
      const queueMsg = pendingCount === 1
        ? "Mensagem na fila — o agente processará quando terminar a tarefa atual."
        : `${pendingCount} mensagens na fila — processando em ordem.`;
      if (useSSE && awaitingRun?.id) {
        return streamEventsResponse(supabase, awaitingRun.id, () => {});
      }
      return json({
        ok: true,
        queued: true,
        pendingCount,
        activeRunId: awaitingRun?.id ?? null,
        message: queueMsg,
      });
    }

    if (resumeRun) runningLocks.delete(projectId);
    runningLocks.set(projectId, Promise.resolve());

    const { data: history } = await supabase
      .from("messages")
      .select("role, parts, tool_calls, meta, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(120);

    const historyRows = history ?? [];
    const restoredExecutionLog = resumeRun ? restoreExecutionLogFromRows(historyRows) : [];
    const loadedCheckpoint = resumeRun
      ? await loadCheckpoint(supabase, projectId, conversationId)
      : null;

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
    /**
     * Resolve o SessionKind interno (legado: 3 valores) a partir do payload.
     * - "taste" + tasteAction="chat" → "taste_chat"
     * - "taste" + tasteAction="start" → "taste_start"
     * - "taste" sem action → "taste_chat" (default)
     * - "byok" → "byok" (exige hasUserLlmKey)
     * - Legacy: "taste_chat" / "taste_start" são aceitos como estão
     */
    let sessionKind: SessionKind = hasUserLlmKey ? "byok" : "taste_chat";
    if (sessionKindRaw === "byok") sessionKind = "byok";
    if (sessionKindRaw === "taste") {
      sessionKind = tasteActionRaw === "start" ? "taste_start" : "taste_chat";
    }
    if (sessionKindRaw === "taste_start") sessionKind = "taste_start";
    if (sessionKindRaw === "taste_chat") sessionKind = "taste_chat";

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

    // === Decisão "caminho barato primeiro" (o que o usuário pediu) ===
    // Se o prompt parece pedido explícito de interação/perguntas ("quero uma mensagem claramente de interação, não de execução")
    // ou é curto/vago, e ainda não existe sandbox alocado para o projeto, NÃO alocamos E2B para este run.
    // O qualify dentro do loop (ou um futuro lightweight) vai responder e marcar awaiting sem container.
    const lastUserContent = (() => {
      const fromBody = (body as any).prompt || (body as any).message || "";
      if (fromBody) return String(fromBody);
      const lastUser = [...historyRows].reverse().find((m: any) => m.role === "user");
      const parts = lastUser?.parts || [];
      const textPart = parts.find((p: any) => p?.type === "text" || typeof p?.text === "string");
      return textPart?.text || textPart?.content || "";
    })();
    const looksLikeInteraction = /quero (só |apenas |uma )?(mensagem|conversa|intera|pergunt|discut|qualif|ideia|brainstorm)|me faz (perguntas|uma pergunta|pergunta)|não (começa|codar|construir|executar|trabalhar) ainda|só conversar|quero (conversar|discutir a ideia)/i.test(lastUserContent)
      || lastUserContent.trim().length < 90;
    const projectHasSandbox = !!(((project as any).meta || {})?.previewSandboxId || ((project as any).meta || {})?.previewReady);
    // Fase 4.7: 3 guardas — (1) interação explícita não aloca, (2) projeto SEM
    // arquivos não aloca (E2B só nasce depois do agente criar algo), (3) projeto
    // com sandbox pré-existente pode reusar.
    const allocateSandboxLocal =
      (!looksLikeInteraction && projectFileCount > 0) || projectHasSandbox;

    // Fase 4.7: o código abaixo (reg + sandbox local) era DEAD CODE — o
    // executeAgentJob em run-job.ts cria seu próprio ToolRegistry e sandbox.
    // A única coisa útil era a checagem antecipada de e2bKey (early 403 antes
    // de gastar tempo de loop), que mantemos como validação rápida.

    const cleanup = () => runningLocks.delete(projectId!);

    const projectTemplate = (project as { template?: string }).template ?? "vite-react";
    const projectMeta = ((project as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
    const deployKeys = await loadDeployConnectorKeys(supabase, userData.user.id);
    const stackCtx = buildStackContext(
      profile?.integration_prefs,
      projectMeta,
      { ...connectorKeys, ...deployKeys },
    );
    const stackAddon = stackPromptAddon(stackCtx);

    // Early e2bKey check: se vamos alocar E2B mas o usuário não tem chave,
    // retornamos 403 AGORA (sem gastar tempo com classify/loop). É duplicado
    // com o check em run-job.ts:204 mas falha mais rápido e com mensagem clara.
    if (allocateSandboxLocal) {
      const e2bKey = await loadUserE2bApiKey(supabase, userData.user.id);
      if (!e2bKey?.trim()) {
        runningLocks.delete(projectId);
        return json({ error: E2B_SETUP_USER_MESSAGE, code: "e2b_not_configured" }, 403);
      }
    }

    const runMetaBase = {
      provider: mainCfg.label,
      model: mainCfg.model,
      sessionKind: tasteStart ? "taste_start" : "byok",
      resume: resumeRun,
      autoResume,
      checkpoint: !!loadedCheckpoint,
      robin: effectiveRobin,
      taste: tasteStart,
    };

    let agentRunId: string | null = null;
    if (resumeRun) {
      const { data: existingRun } = await supabase
        .from("agent_runs")
        .select("id, status, meta")
        .eq("conversation_id", conversationId)
        .eq("project_id", projectId)
        .eq("user_id", userData.user.id)
        .in("status", ["running", "failed"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRun?.id) {
        agentRunId = existingRun.id;
        const prevMeta = (existingRun.meta ?? {}) as Record<string, unknown>;
        await supabase
          .from("agent_runs")
          .update({
            status: "running",
            finished_at: null,
            error: null,
            meta: { ...prevMeta, ...runMetaBase, resumedAt: new Date().toISOString() },
          })
          .eq("id", agentRunId);
      }
    }

    if (!agentRunId) {
      const { data: lockedId, error: lockErr } = await supabase
        .rpc("acquire_agent_run_lock", {
          p_project_id: projectId,
          p_conversation_id: conversationId,
          p_user_id: userData.user.id,
        });

      if (lockErr || !lockedId) {
        runningLocks.delete(projectId);
        return json({ error: "Erro ao iniciar agente — tente novamente." }, 500);
      }

      agentRunId = lockedId;

      // Pode ter sido criado por outra instância (lock já existia), ou por nós.
      // Se a conversation não bater, o run pertence a outra conversa → enfileirar.
      const { data: createdRun } = await supabase
        .from("agent_runs")
        .select("id, conversation_id, meta")
        .eq("id", agentRunId)
        .single();

      if (createdRun && createdRun.conversation_id !== conversationId) {
        await supabase.from("agent_pending_messages").insert({
          project_id: projectId,
          conversation_id: conversationId,
          user_id: userData.user.id,
          body: {
            preferences,
            sessionKind: sessionKindRaw,
            enabledSkillIds,
            enabledMcpIds,
            allocateSandbox: true,
          },
        });
        runningLocks.delete(projectId);
        return json({
          ok: true,
          queued: true,
          pendingCount: 1,
          activeRunId: agentRunId,
          message: "Agente ocupado — sua mensagem foi enfileirada.",
        });
      }

      // Ensure meta is set on newly created runs
      const currentMeta = (createdRun?.meta ?? {}) as Record<string, unknown>;
      if (!currentMeta.provider || !currentMeta.model) {
        await supabase
          .from("agent_runs")
          .update({ meta: { ...currentMeta, ...runMetaBase } })
          .eq("id", agentRunId);
      }
    }

    const finalizeRun = async (
      result: {
        ok: boolean;
        error?: string;
        steps: number;
        canceled?: boolean;
        summary?: string;
        toolsUsed?: string[];
        totalInputTokens?: number;
        totalOutputTokens?: number;
        totalTokens?: number;
        costUsd?: number;
      },
    ) => {
      if (!agentRunId) return;

      // Lê estado atual para NÃO sobrescrever status de espera
      const { data: current } = await supabase
        .from("agent_runs")
        .select("status, meta")
        .eq("id", agentRunId)
        .maybeSingle();
      const currentStatus = current?.status as string | undefined;
      const currentMeta = (current?.meta ?? {}) as Record<string, unknown>;
      const awaitingStates = ["awaiting_user"];
      const isAwaiting = awaitingStates.includes(currentStatus ?? "") || !!currentMeta.awaitingUser;

      let status: string;
      if (result.canceled) {
        status = "canceled";
      } else if (isAwaiting) {
        status = currentStatus!; // Preserva awaiting_user
      } else if (result.ok) {
        status = "completed";
      } else {
        status = "failed";
      }

      const prevMeta = (current?.meta ?? runMetaBase) as Record<string, unknown>;

      await supabase
        .from("agent_runs")
        .update({
          status,
          finished_at: isAwaiting ? null : new Date().toISOString(),
          steps: result.steps,
          error: result.error ?? null,
          meta: {
            ...prevMeta,
            ...(result.summary ? { summary: result.summary } : {}),
            ...(result.toolsUsed?.length ? { toolsUsed: result.toolsUsed } : {}),
            ...(typeof result.totalTokens === "number" ? { totalTokens: result.totalTokens } : {}),
            ...(typeof result.totalInputTokens === "number" ? { totalInputTokens: result.totalInputTokens } : {}),
            ...(typeof result.totalOutputTokens === "number" ? { totalOutputTokens: result.totalOutputTokens } : {}),
            ...(typeof result.costUsd === "number" ? { costUsd: result.costUsd } : {}),
          },
          ...(result.canceled ? { canceled_at: new Date().toISOString() } : {}),
        })
        .eq("id", agentRunId);
    };

    // --- jobParams segue abaixo ---

    const jobParams = {
      projectId,
      conversationId,
      userId: userData.user.id,
      agentRunId: agentRunId!,
      resumeRun,
      preferences,
      sessionKindRaw,
      enabledSkillIds,
      enabledMcpIds,
      planMode,
      // Usa a decisão barata calculada acima (heuristic "looksLikeInteraction").
      // Para prompts de "quero só interação/perguntas" em projeto sem sandbox ainda → false.
      // Isso + a proteção em run-job.ts = zero load de E2B para esses casos.
      allocateSandbox: allocateSandboxLocal,
    };

    const runChunkedJob = async (
      onEvent: (type: string, data: Record<string, unknown>) => void,
    ) => {
      const MAX_INLINE_CHUNKS = 48;
      let chunkResume = resumeRun;
      let result = await executeAgentJob(supabase, { ...jobParams, resumeRun: chunkResume }, onEvent);
      let chunk = 1;
      while (!result.ok && result.resumable && !result.canceled && chunk < MAX_INLINE_CHUNKS) {
        onEvent("resume", {
          chunk: chunk + 1,
          message: "Retomando automaticamente no servidor…",
        });
        chunkResume = true;
        result = await executeAgentJob(
          supabase,
          { ...jobParams, resumeRun: true },
          onEvent,
        );
        chunk++;
      }
      return result;
    };

    if (!useSSE) {
      const result = await runChunkedJob(() => {});
      await finalizeRun(result);
      cleanup();
      return json(result);
    }

    // P0: Inngest handles durable execution. The "run" action is now a thin
    // dispatcher: enqueue the run + send Inngest event + return <1s.
    const eventName: InngestEventName = planMode
      ? "agent/plan.requested"
      : "agent/build.requested";
    const eventPayload = {
      runId: agentRunId,
      projectId,
      conversationId,
      userId: userData.user.id,
      sessionKind: tasteStart ? "taste_start" : (hasUserLlmKey ? "byok" : "taste_chat"),
      preferences: preferences ?? {},
      planMode,
      resume: resumeRun,
    };

    const eventResult = await sendInngestEvent(eventName, eventPayload);
    if (!eventResult.ok) {
      logger.error("inngest.send_failed_fatal", {
        runId: agentRunId!,
        eventName,
        error: eventResult.error,
      });
      await finalizeRun({
        ok: false,
        error: `Inngest send failed: ${eventResult.error ?? "unknown"}`,
        steps: 0,
      });
      cleanup();
      return json({ error: "Falha ao iniciar agente (Inngest)" }, 500);
    }

    // Emit initial stream event so any reconnecting client sees the start.
    await appendStreamEvent(supabase, agentRunId!, "start", {
      type: "start",
      runId: agentRunId,
      projectId,
      conversationId,
      provider: mainCfg.label,
      model: mainCfg.model,
      robin: effectiveRobin,
      taste: tasteStart,
      resume: resumeRun,
      checkpoint: !!loadedCheckpoint,
      sessionKind: tasteStart ? "taste_start" : (hasUserLlmKey ? "byok" : "taste_chat"),
      memoryMessages: loadedCheckpoint?.state.messages.length ?? messages.length,
      mode: planMode ? "plan" : "build",
      eventId: eventResult.ids?.[0] ?? null,
    });

    cleanup();
    return json({
      ok: true,
      runId: agentRunId,
      mode: planMode ? "plan" : "build",
      eventId: eventResult.ids?.[0] ?? null,
      queued: false,
    });
  } catch (e: unknown) {
    if (projectId) runningLocks.delete(projectId);
    logger.error("agent_run.unhandled_error", {
      error: (e as Error)?.message,
      stack: (e as Error)?.stack,
      projectId,
    });
    return json({ error: (e as Error)?.message ?? "erro inesperado" }, 500);
  }
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Correlation-Id": currentCorrelationId() ?? "",
    },
  });
}

type InngestEventName = "agent/plan.requested" | "agent/build.requested";

async function sendInngestEvent(
  name: InngestEventName,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; ids?: string[]; error?: string }> {
  if (!INNGEST_EVENT_KEY) {
    return { ok: false, error: "INNGEST_EVENT_KEY not configured" };
  }
  try {
    const res = await fetch("https://inn.gs/e/" + INNGEST_EVENT_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data, ts: Date.now() }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn("inngest.send_failed", { name, status: res.status, text: text.slice(0, 200) });
      return { ok: false, error: `Inngest returned ${res.status}` };
    }
    const body = (await res.json()) as { ids?: string[] };
    return { ok: true, ids: body.ids };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    logger.warn("inngest.send_exception", { name, error: msg });
    return { ok: false, error: msg };
  }
}

function streamEventsResponse(
  supabase: SupabaseClient,
  runId: string,
  cleanup: () => void,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let seq = 0;
      let finished = false;
      const deadline = Date.now() + 45 * 60 * 1000;

      try {
        while (!finished && Date.now() < deadline) {
          const events = await fetchStreamEventsSince(supabase, runId, seq);
          for (const ev of events) {
            const payload = ev.payload?.type
              ? ev.payload
              : { type: ev.event_type, ...(ev.payload as Record<string, unknown>) };
            controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
            seq = ev.seq;
            if (ev.event_type === "finish" || ev.event_type === "done") finished = true;
          }
          if (!finished) await new Promise((r) => setTimeout(r, 350));
        }
      } catch {
        /* stream fechado */
      } finally {
        cleanup();
        try { controller.close(); } catch { /* */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}