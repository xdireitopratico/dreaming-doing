// index.ts — Edge Function agent-run (build: agentloop-only 2026-06-06).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import {
  type AgentPreferencesPayload,
  loadDeployConnectorKeys,
} from "./connector-keys.ts";
import type { ProviderConfig } from "./providers.ts";
import {
  loadUserLlmContext,
  resolveAgentProvider,
  validateAgentPreferences,
} from "./run-setup.ts";
import {
  buildStackContext,
  stackPromptAddon,
} from "../_shared/stack-context.ts";
import { buildChatHistory } from "./memory.ts";
import { RobinKeyPool } from "./robin-pool.ts";
import {
  E2B_SETUP_USER_MESSAGE,
  loadUserE2bApiKey,
} from "../_shared/user-e2b.ts";
import {
  buildSessionExtensionsPrompt,
  normalizeIdList,
} from "../_shared/session-extensions.ts";
import { loadTasteNvidiaConfig, runTasteChat } from "./taste-session.ts";
import { corsPreflightResponse, FORGE_CORS_HEADERS } from "../_shared/cors.ts";
import {
  correlationIdFromRequest,
  currentCorrelationId,
  logger,
  withCorrelationId,
} from "../_shared/logger.ts";
import { restoreExecutionLogFromRows } from "./executionLogMeta.ts";
import { loadCheckpoint } from "./checkpoint.ts";
import { appendStreamEvent } from "../_shared/agent-stream.ts";
import { isServiceRoleRequest } from "../_shared/service-auth.ts";
import {
  extractOriginalUserRequest,
  looksLikeInteractionOnly,
} from "./qualify.ts";

const runningLocks = new Map<string, Promise<unknown>>();

const corsHeaders = FORGE_CORS_HEADERS;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INNGEST_EVENT_KEY = Deno.env.get("INNGEST_EVENT_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  const correlationId = correlationIdFromRequest(req);

  return await withCorrelationId(correlationId, async () => {
    let projectId: string | undefined;

    try {
      const body = await req.json();

      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
      const token = (req.headers.get("Authorization") ?? "").replace(
        "Bearer ",
        "",
      );
      const isServiceCall = isServiceRoleRequest(token, SERVICE_KEY);

      // Loop executa no handler Inngest (Vercel) — Edge não roda execute.
      if (body.action === "execute") {
        return json(
          {
            error:
              "execute movido para Inngest — use evento agent/build.requested ou agent/plan.requested",
          },
          410,
        );
      }

      if (body.action === "continue_queue") {
        if (!isServiceCall) {
          return json({ error: "continue_queue requer service role" }, 403);
        }
        const cProjectId = body.projectId as string | undefined;
        const cConversationId = body.conversationId as string | undefined;
        const cUserId = body.userId as string | undefined;
        if (!cProjectId || !cConversationId || !cUserId) {
          return json(
            {
              error: "projectId, conversationId, userId obrigatórios",
            },
            400,
          );
        }
        const { handleContinueQueue } = await import("./continue-queue.ts");
        const drainResult = await handleContinueQueue(
          supabase,
          INNGEST_EVENT_KEY,
          {
            projectId: cProjectId,
            conversationId: cConversationId,
            userId: cUserId,
            planMode: body.planMode === true,
          },
        ); // Inngest continue passes prior run's planMode (if any); stored pending intent wins inside handle (no inherit)
        return json(drainResult);
      }

      const { data: userData, error: uErr } = await supabase.auth.getUser(
        token,
      );
      if (uErr || !userData?.user) {
        return json({ error: "Não autenticado" }, 401);
      }

      projectId = typeof body.projectId === "string"
        ? body.projectId
        : undefined;
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

        await appendStreamEvent(supabase, runId, "canceled", {
          type: "canceled",
          message: "Cancelado pelo usuário",
        });
        await appendStreamEvent(supabase, runId, "finish", {
          type: "finish",
          ok: false,
          canceled: true,
          resumable: false,
        });

        // Also clear any queued pending messages for this project so stop truly stops the chain
        await supabase
          .from("agent_pending_messages")
          .delete()
          .eq("project_id", run.project_id ?? projectId)
          .eq("user_id", userData.user.id);

        return json({ ok: true });
      }

      if (body.action === "dispatch_build") {
        const runId = body.runId as string | undefined;
        if (!runId) return json({ error: "runId obrigatório" }, 400);

        const { data: run, error: rErr } = await supabase
          .from("agent_runs")
          .select("id, user_id, project_id, conversation_id, status, meta")
          .eq("id", runId)
          .single();
        if (rErr || !run || run.user_id !== userData.user.id) {
          return json({ error: "Run não encontrada" }, 404);
        }
        if (run.status !== "pending") {
          return json({ error: `Run em status inválido: ${run.status}` }, 400);
        }

        const runMeta = (run.meta ?? {}) as Record<string, unknown>;
        const preferences = (
          runMeta.preferences && typeof runMeta.preferences === "object"
            ? runMeta.preferences
            : {}
        ) as Record<string, unknown>;
        const sessionKind = typeof runMeta.sessionKind === "string"
          ? runMeta.sessionKind
          : "byok";
        const enabledSkillIds = Array.isArray(runMeta.enabledSkillIds)
          ? (runMeta.enabledSkillIds as string[])
          : [];
        const enabledMcpIds = Array.isArray(runMeta.enabledMcpIds)
          ? (runMeta.enabledMcpIds as string[])
          : [];
        const planSummary = typeof runMeta.planSummary === "string"
          ? runMeta.planSummary
          : "";
        const planSourceRunId = typeof runMeta.planSourceRunId === "string"
          ? runMeta.planSourceRunId
          : undefined;

        const eventPayload = {
          runId,
          projectId: run.project_id,
          conversationId: run.conversation_id,
          userId: userData.user.id,
          sessionKind,
          preferences,
          enabledSkillIds,
          enabledMcpIds,
          planMode: false,
          plan: planSummary || undefined,
          planSourceRunId,
        };

        const eventResult = await sendInngestEvent(
          "agent/build.requested",
          eventPayload,
        );
        if (!eventResult.ok) {
          logger.error("dispatch_build.inngest_failed", {
            runId,
            error: eventResult.error,
          });
          // Harden: append terminal finish + delete so we never leave a pending run without events.
          // The action owns INNGEST check+send+loud failure.
          await appendStreamEvent(supabase, runId, "finish", {
            type: "finish",
            ok: false,
            error: eventResult.error ?? "unknown",
            resumable: false,
          });
          await supabase.from("agent_runs").delete().eq("id", runId);
          return json(
            {
              error: `Falha ao iniciar build: ${
                eventResult.error ?? "unknown"
              }`,
            },
            500,
          );
        }

        const dispatchEventId = eventResult.ids?.[0] ?? null;
        if (!dispatchEventId) {
          // Ensure no silent ok without eventId from hardened path
          logger.error("dispatch_build.no_event_id", { runId });
          await appendStreamEvent(supabase, runId, "finish", {
            type: "finish",
            ok: false,
            error: "INNGEST_EVENT_KEY not configured (no eventId)",
            resumable: false,
          });
          await supabase.from("agent_runs").delete().eq("id", runId);
          return json(
            {
              error:
                "Build não iniciou — configure INNGEST_EVENT_KEY nas secrets da Edge (docs/EDGE-SECRETS.md).",
            },
            500,
          );
        }

        await appendStreamEvent(supabase, runId, "start", {
          type: "start",
          runId,
          projectId: run.project_id,
          conversationId: run.conversation_id,
          mode: "build",
          planSourceRunId: planSourceRunId ?? null,
          eventId: dispatchEventId,
        });

        return json({ ok: true, eventId: dispatchEventId });
      }

      projectId = typeof body.projectId === "string"
        ? body.projectId
        : undefined;
      const conversationId = body.conversationId;
      const preferences = body.preferences as
        | AgentPreferencesPayload
        | undefined;
      const sessionKindRaw = body.sessionKind as string | undefined;
      const tasteActionRaw = body.tasteAction as string | undefined;
      const resumeRun = body.resume === true;
      const autoResume = body.autoResume === true;
      // Modo vem do dropdown (estilo Lovable): Plan = pensar/plano; Build = executar.
      // - "plan": propõe plano, não mexe em código até aprovação
      // - "build": loop de ferramentas (implementação direta quando pedido claro)
      const modeRaw = typeof body.mode === "string"
        ? body.mode.toLowerCase()
        : "chat";
      const mode: "chat" | "plan" | "build" =
        modeRaw === "plan" || modeRaw === "build" ? modeRaw : "chat";
      const planMode = mode === "plan";
      const enabledSkillIds = normalizeIdList(body.enabledSkillIds);
      const enabledMcpIds = normalizeIdList(body.enabledMcpIds);
      const sessionExt = await buildSessionExtensionsPrompt(
        enabledSkillIds,
        enabledMcpIds,
      );

      if (!projectId || !conversationId) {
        return json({ error: "projectId e conversationId obrigatórios" }, 400);
      }

      const { expireStaleRuns, sanitizePendingQueue } = await import(
        "../_shared/agent-pending-queue.ts"
      );
      await expireStaleRuns(supabase, projectId);
      await sanitizePendingQueue(
        supabase,
        projectId,
        userData.user.id,
        conversationId,
      );

      const { data: project } = await supabase
        .from("projects")
        .select("id, owner_id, template, meta")
        .eq("id", projectId)
        .single();
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

      if (body.action === "pending_count") {
        const { sanitizePendingQueue, countPendingMessages } = await import(
          "../_shared/agent-pending-queue.ts"
        );
        await sanitizePendingQueue(
          supabase,
          projectId,
          userData.user.id,
          conversationId,
        );
        const pendingCount = await countPendingMessages(
          supabase,
          projectId,
          userData.user.id,
        );
        return json({ pendingCount });
      }

      if (body.action === "list_pending") {
        const {
          sanitizePendingQueue,
          listPendingMessages,
          countPendingMessages,
        } = await import("../_shared/agent-pending-queue.ts");
        await sanitizePendingQueue(
          supabase,
          projectId,
          userData.user.id,
          conversationId,
        );
        const items = await listPendingMessages(
          supabase,
          projectId,
          userData.user.id,
        );
        const pendingCount = await countPendingMessages(
          supabase,
          projectId,
          userData.user.id,
        );
        return json({ pendingCount, items });
      }

      if (body.action === "clear_pending") {
        const { clearPendingMessages, countPendingMessages } = await import(
          "../_shared/agent-pending-queue.ts"
        );
        const messageId = typeof body.messageId === "string"
          ? body.messageId
          : undefined;
        const removed = await clearPendingMessages(
          supabase,
          projectId,
          userData.user.id,
          messageId,
        );
        const pendingCount = await countPendingMessages(
          supabase,
          projectId,
          userData.user.id,
        );
        return json({ ok: true, removed, pendingCount });
      }

      if (body.action === "drain_queue") {
        const { handleContinueQueue } = await import("./continue-queue.ts");
        const { sanitizePendingQueue } = await import(
          "../_shared/agent-pending-queue.ts"
        );
        await sanitizePendingQueue(
          supabase,
          projectId,
          userData.user.id,
          conversationId,
        );
        const drainResult = await handleContinueQueue(
          supabase,
          INNGEST_EVENT_KEY,
          {
            projectId,
            conversationId,
            userId: userData.user.id,
            planMode: planMode,
          },
        ); // planMode here is call-time fallback; continue-queue prefers pendingBody.mode (send-time) if present (PR3)
        if (drainResult.continued && drainResult.runId) {
          return json({
            ok: true,
            runId: drainResult.runId,
            pendingCount: drainResult.pendingCount ?? 0,
            continued: true,
          });
        }
        return json({
          ok: true,
          continued: false,
          pendingCount: drainResult.pendingCount ?? 0,
          reason: drainResult.reason,
        });
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "trial_messages_remaining, taste_chat_remaining, taste_start_remaining, integration_prefs",
        )
        .eq("id", userData.user.id)
        .maybeSingle();

      const tasteChatRemaining =
        typeof profile?.taste_chat_remaining === "number"
          ? profile.taste_chat_remaining
          : typeof profile?.trial_messages_remaining === "number"
          ? profile.trial_messages_remaining
          : 50;
      const tasteStartRemaining =
        typeof profile?.taste_start_remaining === "number"
          ? profile.taste_start_remaining
          : 1;

      const { data: activeRun } = await supabase
        .from("agent_runs")
        .select("id, status, meta")
        .eq("project_id", projectId)
        .in("status", ["running", "awaiting_user", "pending"])
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
          await supabase
            .from("agent_runs")
            .update({ status: "awaiting_user", finished_at: null })
            .eq("id", completedAwaiting.id);
        }
      }

      const latestMeta = (awaitingRun?.meta ?? {}) as Record<string, unknown>;
      const isAwaiting = awaitingRun?.status === "awaiting_user" ||
        !!latestMeta.awaitingUser;

      // Se o run está ativamente rodando (não apenas esperando), enfileira.
      // Se está awaiting_user, NÃO enfileira — cria run de continuação.
      const isRunning = awaitingRun?.status === "running" ||
        awaitingRun?.status === "pending" ||
        runningLocks.has(projectId);

      const enqueueIntent = body.enqueue === true;

      if (isRunning && !resumeRun && !isAwaiting) {
        if (!enqueueIntent) {
          const { countPendingMessages } = await import(
            "../_shared/agent-pending-queue.ts"
          );
          const pendingCount = await countPendingMessages(
            supabase,
            projectId,
            userData.user.id,
          );
          logger.info("agent_run.busy_no_enqueue", {
            projectId,
            pendingCount,
            activeRunId: awaitingRun?.id ?? null,
          });
          return json({
            ok: true,
            busy: true,
            pendingCount,
            activeRunId: awaitingRun?.id ?? null,
            message:
              "Agente ocupado — aguarde ou envie mensagem com o agente ativo.",
          });
        }

        const { buildQueueInsertBody, countPendingMessages } = await import(
          "../_shared/agent-pending-queue.ts"
        );
        const queueBody = await buildQueueInsertBody(supabase, conversationId, {
          preferences,
          sessionKind: sessionKindRaw,
          enabledSkillIds,
          enabledMcpIds,
          allocateSandbox: true,
          mode: body.mode ?? "build",
        });
        await supabase.from("agent_pending_messages").insert({
          project_id: projectId,
          conversation_id: conversationId,
          user_id: userData.user.id,
          body: queueBody,
        });
        const pendingCount = await countPendingMessages(
          supabase,
          projectId,
          userData.user.id,
        );
        const preview = typeof queueBody.text === "string"
          ? queueBody.text.slice(0, 120)
          : null;
        const queueMsg = pendingCount === 1
          ? "Mensagem na fila — o agente processará quando terminar a tarefa atual."
          : `${pendingCount} mensagens na fila — processando em ordem.`;
        return json({
          ok: true,
          queued: true,
          pendingCount,
          preview,
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
      const restoredExecutionLog = resumeRun
        ? restoreExecutionLogFromRows(historyRows)
        : [];
      const loadedCheckpoint = resumeRun
        ? await loadCheckpoint(supabase, projectId, conversationId)
        : null;

      const { userOnlyKeys, hasUserLlmKey } = await loadUserLlmContext(
        supabase,
        userData.user.id,
        preferences,
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
        return json(
          {
            error:
              "Limite Taste Chat (50) atingido. Configure suas API em /api para continuar.",
          },
          402,
        );
      }
      if (sessionKind === "taste_start" && tasteStartRemaining <= 0) {
        runningLocks.delete(projectId);
        return json(
          {
            error:
              "Start Project já utilizado. Configure API para construir sem limites.",
          },
          402,
        );
      }
      if (!hasUserLlmKey && sessionKind === "byok") {
        runningLocks.delete(projectId);
        return json(
          {
            error:
              "Configure suas API em /api ou use o Taste Chat / Start Project.",
          },
          402,
        );
      }

      if (sessionKind === "byok") {
        const prefError = validateAgentPreferences(preferences);
        if (prefError) {
          runningLocks.delete(projectId);
          return json({ error: prefError }, 400);
        }
      }

      // ─── Taste Chat: concierge NVIDIA, sem agent loop (JSON; mensagem salva no DB) ───
      if (sessionKind === "taste_chat") {
        const cleanup = () => runningLocks.delete(projectId!);
        try {
          const tasteCfg = await loadTasteNvidiaConfig(supabase);
          const result = await runTasteChat({
            supabase,
            userId: userData.user.id,
            conversationId,
            cfg: tasteCfg,
            emit: () => {},
            sessionAddon: sessionExt.addon,
            enabledSkillIds,
            enabledMcpIds,
            activeSkills: sessionExt.skillNames,
            activeMcps: sessionExt.mcpNames,
          });
          await supabase
            .from("profiles")
            .update({
              taste_chat_remaining: Math.max(0, tasteChatRemaining - 1),
            })
            .eq("id", userData.user.id);
          cleanup();
          return json(result);
        } catch (err: unknown) {
          cleanup();
          return json(
            {
              error: (err as Error)?.message ?? "Taste indisponível",
            },
            500,
          );
        }
      }

      let robinPool: RobinKeyPool | null = null;
      let connectorKeys: Record<string, string> = {};
      let mainCfg: ProviderConfig;
      let effectiveRobin = false;
      let tasteStart = false;

      try {
        if (sessionKind === "taste_start") {
          await supabase
            .from("profiles")
            .update({
              taste_start_remaining: Math.max(0, tasteStartRemaining - 1),
            })
            .eq("id", userData.user.id);
        }
        const setup = await resolveAgentProvider({
          supabase,
          userId: userData.user.id,
          preferences,
          sessionKind: sessionKind === "taste_start" ? "taste_start" : "byok",
          userOnlyKeys,
          tasteStartLabelPrefix: sessionKind === "taste_start",
        });
        mainCfg = setup.mainCfg;
        connectorKeys = setup.connectorKeys;
        robinPool = setup.robinPool;
        effectiveRobin = setup.effectiveRobin;
        tasteStart = setup.tasteStart;
      } catch (err: unknown) {
        runningLocks.delete(projectId);
        return json(
          {
            error: (err as Error)?.message ?? "Provider LLM não configurado",
          },
          500,
        );
      }

      const messages = await buildChatHistory(historyRows, 120, mainCfg.model);

      // === Decisão "caminho barato primeiro" (o que o usuário pediu) ===
      // Se o prompt parece pedido explícito de interação/perguntas ("quero uma mensagem claramente de interação, não de execução")
      // ou é curto/vago, e ainda não existe sandbox alocado para o projeto, NÃO alocamos E2B para este run.
      // O qualify dentro do loop (ou um futuro lightweight) vai responder e marcar awaiting sem container.
      // Use meta-aware extract (prefers skipping plan_approved meta) for the triggering user request; force allocate
      // if history contains prior plan_approved (makes follow-up "add X" after approve allocate sandbox reliably).
      const fromBody = (body as any).prompt || (body as any).message || "";
      const lastUserContent = fromBody
        ? String(fromBody)
        : extractOriginalUserRequest(messages);
      const looksLikeInteraction = looksLikeInteractionOnly(lastUserContent);
      const projectHasSandbox = !!(
        ((project as any).meta || {})?.previewSandboxId ||
        ((project as any).meta || {})?.previewReady
      );
      const hasApprovedPlanInHistory = messages.some((m) => {
        const meta = (m?.meta ?? {}) as Record<string, unknown>;
        return (
          m?.role === "user" &&
          (meta.kind === "plan_approved" ||
            typeof meta.planSourceRunId === "string")
        );
      });
      // Fase 4.7: 3 guardas — (1) interação explícita não aloca, (2) projeto SEM
      // arquivos não aloca (E2B só nasce depois do agente criar algo), (3) projeto
      // com sandbox pré-existente pode reusar.
      // + hasApproved for plan+follow-up proof.
      const allocateSandboxLocal = hasApprovedPlanInHistory ||
        (!looksLikeInteraction && projectFileCount > 0) ||
        projectHasSandbox;

      // Fase 4.7: o código abaixo (reg + sandbox local) era DEAD CODE — o
      // executeAgentJob em run-job.ts cria seu próprio ToolRegistry e sandbox.
      // A única coisa útil era a checagem antecipada de e2bKey (early 403 antes
      // de gastar tempo de loop), que mantemos como validação rápida.

      const cleanup = () => runningLocks.delete(projectId!);

      const projectTemplate = (project as { template?: string }).template ??
        "vite-react";
      const projectMeta =
        ((project as { meta?: Record<string, unknown> }).meta ?? {}) as Record<
          string,
          unknown
        >;
      const deployKeys = await loadDeployConnectorKeys(
        supabase,
        userData.user.id,
      );
      const stackCtx = buildStackContext(
        profile?.integration_prefs,
        projectMeta,
        {
          ...connectorKeys,
          ...deployKeys,
        },
      );
      const stackAddon = stackPromptAddon(stackCtx);

      // Early e2bKey check: se vamos alocar E2B mas o usuário não tem chave,
      // retornamos 403 AGORA (sem gastar tempo com classify/loop). É duplicado
      // com o check em run-job.ts:204 mas falha mais rápido e com mensagem clara.
      if (allocateSandboxLocal) {
        const e2bKey = await loadUserE2bApiKey(supabase, userData.user.id);
        if (!e2bKey?.trim()) {
          runningLocks.delete(projectId);
          return json(
            {
              error: E2B_SETUP_USER_MESSAGE,
              code: "e2b_not_configured",
            },
            403,
          );
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
        preferences: preferences ?? {},
        enabledSkillIds,
        enabledMcpIds,
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
              meta: {
                ...prevMeta,
                ...runMetaBase,
                resumedAt: new Date().toISOString(),
              },
            })
            .eq("id", agentRunId);
        }
      }

      if (!agentRunId) {
        const { data: lockedId, error: lockErr } = await supabase.rpc(
          "acquire_agent_run_lock",
          {
            p_project_id: projectId,
            p_conversation_id: conversationId,
            p_user_id: userData.user.id,
          },
        );

        if (lockErr || !lockedId) {
          runningLocks.delete(projectId);
          return json(
            { error: "Erro ao iniciar agente — tente novamente." },
            500,
          );
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
          runningLocks.delete(projectId);
          if (!enqueueIntent) {
            const { countPendingMessages } = await import(
              "../_shared/agent-pending-queue.ts"
            );
            const pendingCount = await countPendingMessages(
              supabase,
              projectId,
              userData.user.id,
            );
            return json({
              ok: true,
              busy: true,
              pendingCount,
              activeRunId: agentRunId,
              message: "Agente ocupado em outra conversa.",
            });
          }
          const { buildQueueInsertBody, countPendingMessages } = await import(
            "../_shared/agent-pending-queue.ts"
          );
          const queueBody = await buildQueueInsertBody(
            supabase,
            conversationId,
            {
              preferences,
              sessionKind: sessionKindRaw,
              enabledSkillIds,
              enabledMcpIds,
              allocateSandbox: true,
              mode: body.mode ?? "build",
            },
          );
          await supabase.from("agent_pending_messages").insert({
            project_id: projectId,
            conversation_id: conversationId,
            user_id: userData.user.id,
            body: queueBody,
          });
          const pendingCount = await countPendingMessages(
            supabase,
            projectId,
            userData.user.id,
          );
          return json({
            ok: true,
            queued: true,
            pendingCount,
            preview: typeof queueBody.text === "string"
              ? queueBody.text.slice(0, 120)
              : null,
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

      const finalizeRun = async (result: {
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
      }) => {
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
        const isAwaiting = awaitingStates.includes(currentStatus ?? "") ||
          !!currentMeta.awaitingUser;

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

        const prevMeta = (current?.meta ?? runMetaBase) as Record<
          string,
          unknown
        >;

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
              ...(result.toolsUsed?.length
                ? { toolsUsed: result.toolsUsed }
                : {}),
              ...(typeof result.totalTokens === "number"
                ? { totalTokens: result.totalTokens }
                : {}),
              ...(typeof result.totalInputTokens === "number"
                ? { totalInputTokens: result.totalInputTokens }
                : {}),
              ...(typeof result.totalOutputTokens === "number"
                ? { totalOutputTokens: result.totalOutputTokens }
                : {}),
              ...(typeof result.costUsd === "number"
                ? { costUsd: result.costUsd }
                : {}),
            },
            ...(result.canceled
              ? { canceled_at: new Date().toISOString() }
              : {}),
          })
          .eq("id", agentRunId);
      };

      // P0: Inngest handles durable execution. The "run" action is a thin
      // dispatcher: enqueue the run + send Inngest event + return <1s.
      const eventName: InngestEventName = planMode
        ? "agent/plan.requested"
        : "agent/build.requested";
      const eventPayload = {
        runId: agentRunId,
        projectId,
        conversationId,
        userId: userData.user.id,
        sessionKind: tasteStart
          ? "taste_start"
          : hasUserLlmKey
          ? "byok"
          : "taste_chat",
        preferences: preferences ?? {},
        enabledSkillIds,
        enabledMcpIds,
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
        // Early loud error + append finish (never leave pending run without terminal event)
        await appendStreamEvent(supabase, agentRunId!, "finish", {
          type: "finish",
          ok: false,
          error: eventResult.error ?? "Inngest dispatch failed",
          resumable: false,
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
        sessionKind: tasteStart
          ? "taste_start"
          : hasUserLlmKey
          ? "byok"
          : "taste_chat",
        memoryMessages: loadedCheckpoint?.state.messages.length ??
          messages.length,
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
  explicitKey?: string,
): Promise<{ ok: boolean; ids?: string[]; error?: string }> {
  const key = explicitKey ?? INNGEST_EVENT_KEY;
  if (!key) {
    return { ok: false, error: "INNGEST_EVENT_KEY not configured" };
  }
  try {
    const res = await fetch("https://inn.gs/e/" + key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data, ts: Date.now() }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn("inngest.send_failed", {
        name,
        status: res.status,
        text: text.slice(0, 200),
      });
      return { ok: false, error: `Inngest returned ${res.status}` };
    }
    const body = (await res.json()) as { ids?: string[] };
    if (!body.ids || body.ids.length === 0) {
      // Centralize: treat HTTP 200 + empty ids from inn.gs as dispatch failure.
      // This makes !eventId loud-fail + append finish uniform across main run,
      // dispatch_build, and continue-queue (all hit their existing !ok hardened paths).
      // Avoids asymmetry on edge case of successful response with no ids.
      return { ok: false, error: "Inngest returned no event ids" };
    }
    return { ok: true, ids: body.ids };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    logger.warn("inngest.send_exception", { name, error: msg });
    return { ok: false, error: msg };
  }
}

export { sendInngestEvent };
