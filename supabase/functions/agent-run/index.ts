// index.ts — Edge Function agent-run (build: agentloop-only 2026-06-06).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { ToolRegistry } from "./registry.ts";
import { AgentLoop, resolvePlanDecision } from "./loop.ts";
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
import { registerDeployTool } from "./tools/deploy.ts";
import { loadTasteNvidiaConfig, runTasteChat } from "./taste-session.ts";
import { FORGE_CORS_HEADERS, corsPreflightResponse } from "../_shared/cors.ts";
import { logger, withCorrelationId, correlationIdFromRequest, currentCorrelationId } from "../_shared/logger.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { buildSandboxEnv } from "./sandbox-env.ts";
import { enqueueAgentChunk, invokeAgentWorker } from "../_shared/agent-queue.ts";
import { appendStreamEvent, fetchStreamEventsSince } from "../_shared/agent-stream.ts";
import { executeAgentJob } from "./run-job.ts";
import { validateApprovedSteps } from "./plan-mode.ts";
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
  const correlationId = correlationIdFromRequest(req);

  return await withCorrelationId(correlationId, async () => {
  let projectId: string | undefined;

  try {
    const body = await req.json();

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
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
        .select("id, user_id, status, canceled_at")
        .eq("id", runId)
        .maybeSingle();

      if (!run || run.user_id !== userData.user.id) {
        return json({ error: "Run não encontrada" }, 404);
      }
      if (run.status !== "running" || run.canceled_at) {
        return json({ ok: true, already: true });
      }

      const now = new Date().toISOString();
      await supabase
        .from("agent_runs")
        .update({ canceled_at: now })
        .eq("id", runId);

      return json({ ok: true });
    }

    if (body.action === "plan_approve" || body.action === "plan_reject") {
      const runId = body.runId as string | undefined;
      const planId = body.planId as string | undefined;
      if (!runId || !planId) {
        return json({ error: "runId e planId obrigatórios" }, 400);
      }

      const { data: run } = await supabase
        .from("agent_runs")
        .select("id, user_id, project_id, status, meta")
        .eq("id", runId)
        .maybeSingle();

      if (!run || run.user_id !== userData.user.id) {
        return json({ error: "Run não encontrada" }, 404);
      }

      const meta = (run.meta ?? {}) as Record<string, unknown>;
      const pendingPlan = meta.pendingPlan as Record<string, unknown> | null;
      if (!pendingPlan || pendingPlan.planId !== planId) {
        return json({ error: "Plano não corresponde (stale ou já decidido)" }, 409);
      }
      if (pendingPlan.decision) {
        return json({ error: "Plano já decidido", already: true }, 409);
      }

      if (body.action === "plan_reject") {
        const reason = typeof body.reason === "string" ? body.reason : "";
        const decision = { action: "reject" as const, reason };
        // Sinaliza o resolver in-process (fast path) e o poll cross-process.
        const resolvedInProcess = resolvePlanDecision(runId, planId, decision);
        const now = new Date().toISOString();
        const updatedMeta: Record<string, unknown> = {
          ...meta,
          pendingPlan: { ...pendingPlan, decision, decidedAt: now },
          planMode: true,
        };
        await supabase
          .from("agent_runs")
          .update({ status: "rejected", finished_at: now, meta: updatedMeta })
          .eq("id", runId);
        logger.event("agent_run.plan_rejected", {
          runId,
          planId,
          reason: reason.slice(0, 200),
          inProcess: resolvedInProcess,
        });
        return json({ ok: true, resolvedInProcess });
      }

      // plan_approve
      const originalSteps = (pendingPlan.steps as unknown[]) ?? [];
      const approvedValidation = validateApprovedSteps(
        // O validador espera PlanStep[] mas só usa .id; rebuild a partir de pendingPlan.steps
        originalSteps.map((s) => {
          const r = (s ?? {}) as Record<string, unknown>;
          return {
            id: String(r.id ?? ""),
            type: (r.type as never) ?? "custom",
            description: String(r.description ?? ""),
            filePath: typeof r.filePath === "string" ? r.filePath : undefined,
            estimatedCost: typeof r.estimatedCost === "number" ? r.estimatedCost : 0.002,
            enabled: r.enabled !== false,
          };
        }),
        body.steps,
      );
      if (!approvedValidation.ok) {
        return json({ error: approvedValidation.reason }, 400);
      }
      const decision = { action: "approve" as const, steps: approvedValidation.steps };
      const resolvedInProcess = resolvePlanDecision(runId, planId, decision);
      const now = new Date().toISOString();
      const updatedMeta: Record<string, unknown> = {
        ...meta,
        pendingPlan: { ...pendingPlan, decision, decidedAt: now },
        planMode: true,
      };
      await supabase
        .from("agent_runs")
        .update({ status: "running", meta: updatedMeta })
        .eq("id", runId);
      logger.event("agent_run.plan_approved", {
        runId,
        planId,
        stepCount: approvedValidation.steps.length,
        inProcess: resolvedInProcess,
      });
      return json({ ok: true, resolvedInProcess, steps: approvedValidation.steps });
    }

    projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const conversationId = body.conversationId;
    const preferences = body.preferences as AgentPreferencesPayload | undefined;
    const sessionKindRaw = body.sessionKind as string | undefined;
    const tasteActionRaw = body.tasteAction as string | undefined;
    const resumeRun = body.resume === true;
    const autoResume = body.autoResume === true;
    const planMode = body.planMode !== false; // Fase 4.6: default ON; opt-out com planMode=false
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
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "running")
      .maybeSingle();

    if ((runningLocks.has(projectId) || activeRun) && !resumeRun) {
      await supabase.from("agent_pending_messages").insert({
        project_id: projectId,
        conversation_id: conversationId,
        user_id: userData.user.id,
        body: {
          preferences,
          sessionKind: sessionKindRaw,
          enabledSkillIds,
          enabledMcpIds,
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
      if (useSSE && activeRun?.id) {
        return streamEventsResponse(supabase, activeRun.id, () => {});
      }
      return json({
        ok: true,
        queued: true,
        pendingCount,
        activeRunId: activeRun?.id ?? null,
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
    registerShellTool(reg, {
      sandbox,
      projectId,
      supabase,
      sandboxEnv: buildSandboxEnv(connectorKeys, deployKeys),
    });
    registerMcpForgeTools(reg, {
      supabase,
      projectId,
      userId: userData.user.id,
      enabledMcpIds,
      deployKeys,
      context7ApiKey: Deno.env.get("CONTEXT7_API_KEY") ?? undefined,
    });
    const deployTokenKey =
      stackCtx.deployTarget === "vercel"
        ? "VERCEL_TOKEN"
        : stackCtx.deployTarget === "netlify"
          ? "NETLIFY_TOKEN"
          : stackCtx.deployTarget === "cloudflare"
            ? "CLOUDFLARE_API_TOKEN"
            : null;
    registerDeployTool(reg, {
      supabase,
      projectId,
      userId: userData.user.id,
      deployTarget: stackCtx.deployTarget,
      hasDeployToken: deployTokenKey ? !!deployKeys[deployTokenKey] : false,
    });

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
      const { data: newRun } = await supabase
        .from("agent_runs")
        .insert({
          project_id: projectId,
          conversation_id: conversationId,
          user_id: userData.user.id,
          status: "running",
          meta: runMetaBase,
        })
        .select("id")
        .single();
      agentRunId = newRun?.id ?? null;
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
      const status = result.canceled
        ? "canceled"
        : result.ok
          ? "completed"
          : "failed";

      const { data: existing } = await supabase
        .from("agent_runs")
        .select("meta")
        .eq("id", agentRunId)
        .maybeSingle();
      const prevMeta = (existing?.meta ?? runMetaBase) as Record<string, unknown>;

      await supabase
        .from("agent_runs")
        .update({
          status,
          finished_at: new Date().toISOString(),
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

    const buildState = (): AgentState => {
      if (loadedCheckpoint) {
        const cp = loadedCheckpoint.state;
        return {
          ...cp,
          projectId,
          conversationId,
          userId: userData.user.id,
          messages: cp.messages.length >= messages.length ? cp.messages : [...messages],
          executionLog: cp.executionLog.length > 0 ? cp.executionLog : [...restoredExecutionLog],
        };
      }
      return {
        projectId, conversationId, userId: userData.user.id,
        messages: [...messages],
        phase: LoopPhase.GATHER_CONTEXT,
        currentStepIndex: 0,
        context: null, intent: null, plan: null,
        validationResults: [],
        executionLog: [...restoredExecutionLog],
        retryFeedback: null,
        totalSteps: 0,
      };
    };

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
            runId: agentRunId,
          }
          : {
            sessionAddon: sessionExt.addon,
            userSkillNames: sessionExt.skillNames,
            resumeRun,
            hasCheckpoint: !!loadedCheckpoint,
            resumePhase: loadedCheckpoint?.phase ?? null,
            complexityScore: loadedCheckpoint?.extra.complexityScore,
            maxStepsFromCheckpoint: loadedCheckpoint?.extra.maxStepsLimit,
            runId: agentRunId,
          },
      );
    };

    // Canônico: AgentLoop (run-job.ts). Chunks longos: PGMQ + agent-worker (servidor).
    // Fallback inline se PGMQ indisponível.

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
    };

    const queuePayload = {
      runId: agentRunId!,
      projectId,
      conversationId,
      userId: userData.user.id,
      resume: resumeRun,
      accessToken: token,
      body: {
        preferences,
        sessionKind: tasteStart ? "taste_start" : "byok",
        enabledSkillIds,
        enabledMcpIds,
      },
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

    const queued = await enqueueAgentChunk(supabase, queuePayload);
    if (queued) {
      await appendStreamEvent(supabase, agentRunId!, "start", {
        type: "start",
        runId: agentRunId,
        projectId,
        conversationId,
        provider: mainCfg.label,
        robin: effectiveRobin,
        taste: tasteStart,
        resume: resumeRun,
        checkpoint: !!loadedCheckpoint,
        sessionKind: tasteStart ? "taste_start" : "byok",
        memoryMessages: loadedCheckpoint?.state.messages.length ?? messages.length,
        queued: true,
      });
      await invokeAgentWorker(SUPABASE_URL, SERVICE_KEY);
      cleanup();
      return streamEventsResponse(supabase, agentRunId!, cleanup);
    }

    // Fallback: SSE inline (sem PGMQ)
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
          runId: agentRunId,
          provider: mainCfg.label,
          robin: effectiveRobin,
          taste: tasteStart,
          resume: resumeRun,
          checkpoint: !!loadedCheckpoint,
          sessionKind: tasteStart ? "taste_start" : "byok",
          memoryMessages: loadedCheckpoint?.state.messages.length ?? messages.length,
          inlineFallback: true,
        });

        runChunkedJob((type, data) => emit({ type, data }))
          .then(async (result) => {
            await finalizeRun(result);
            cleanup();
            emit({ type: "finish", ...result, resumable: !result.ok && !result.canceled });
            try { controller.close(); } catch { /* closed */ }
          })
          .catch(async (err) => {
            await finalizeRun({ ok: false, error: (err as Error)?.message, steps: 0 });
            cleanup();
            emit({ type: "error", error: (err as Error)?.message, recoverable: true });
            emit({ type: "finish", ok: false, error: (err as Error)?.message, resumable: true });
            try { controller.close(); } catch { /* closed */ }
          });
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

function streamEventsResponse(
  supabase: ReturnType<typeof createClient>,
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