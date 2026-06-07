// useSSE.ts — Streaming SSE do agent-run (motor de prompt)
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { parseAgentDiagnostics, pushDiagnostics } from "@/hooks/useDiagnostics";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";
import { dispatchTasteUiAction, isTasteUiAction } from "@/lib/taste-ui-actions";
import { formatAgentFetchError, formatAgentHttpError } from "@/lib/agent-fetch-errors";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { cancelAgentRun } from "@/lib/agent-cancel";

export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface PlanStep {
  id: string;
  type: "create_file" | "edit_file" | "shell_exec" | "install_dep" | "observe" | "custom";
  description: string;
  filePath?: string;
  estimatedCost?: number;
  enabled: boolean;
}

export interface PendingPlan {
  planId: string;
  summary: string;
  /** Justificativa amigável em PT-BR (1-2 frases) — exibida acima dos passos. */
  rationale?: string;
  steps: PlanStep[];
  ttlMs: number;
  /** ISO timestamp do agent_proposed. */
  proposedAt: number;
  /** ID do run (pra approve/reject). */
  runId: string;
  /** Project ID (pra approve/reject). */
  projectId: string;
}

export interface AgentProgress {
  phase: string | null;
  message: string | null;
  currentStep: number | null;
  totalSteps: number | null;
  tools: Array<{ name: string; args: Record<string, unknown>; ok?: boolean; error?: string }>;
  cost: number;
  model: string | null;
  skills: string[];
  runtimeChecks: Array<{ name: string; ok: boolean }>;
  timeline: SSEEvent[];
  summary: string | null;
  error: string | null;
  finished: boolean;
  /** Pode retomar após queda de conexão ou rate limit */
  resumable: boolean;
  /** Aviso amigável (ROBIN / rate limit) */
  statusHint: string | null;
  /** Texto do modelo ainda em voo (SSE assistant_text), antes de persistir no DB. */
  streamText: string | null;
  /** Último evento finish: true = agente concluiu com sucesso. */
  lastFinishOk: boolean | null;
  /** Retomada automática em andamento (Fase A — sem botão Continuar). */
  autoResuming: boolean;
  /** Mensagens do usuário aguardando na fila do projeto. */
  pendingQueueCount: number;
  /** Diffs capturados durante a execução (fs_write/fs_edit). */
  diffs: Array<{
    id: string;
    path: string;
    before: string;
    after: string;
    op: "write" | "edit";
    timestamp: number;
  }>;
  /** Fase 4.6: plano aguardando aprovação do usuário. Null = sem plano pendente. */
  pendingPlan: PendingPlan | null;
  /** Stop/cancel signal for UI convergence (from "canceled" event or finish{canceled:true}). */
  canceled?: boolean;
  /** Gate active (qualify or plan) — do not auto-execute or auto-preview-boot. */
  awaiting?: boolean;
  /** Última decisão de gate (para mostrar ao usuário por que parou em conversa ou foi pra build). */
  lastGateDecision?: { phase: string; reason: string; at: number } | null;
}

export type AgentConnectOptions = {
  /** Retoma após queda de conexão ou limite — não reinicia o chat do zero */
  resume?: boolean;
  /** Fase 4.7: modo escolhido pelo usuário no dropdown (Chat/Plan/Build). */
  mode?: "chat" | "plan" | "build";
};

const initialState: AgentProgress = {
  phase: null,
  message: null,
  currentStep: null,
  totalSteps: null,
  tools: [],
  cost: 0,
  model: null,
  skills: [],
  runtimeChecks: [],
  timeline: [],
  lastGateDecision: null,
  summary: null,
  error: null,
  finished: false,
  resumable: false,
  statusHint: null,
  streamText: null,
  lastFinishOk: null,
  autoResuming: false,
  pendingQueueCount: 0,
  diffs: [],
  pendingPlan: null,
  canceled: false,
  awaiting: false,
};

/** Legado — retomada de chunks agora é server-side (agent-worker + PGMQ). */
export const MAX_AUTO_RESUME_CHUNKS = 1;

const MODEL_COSTS: Record<string, number> = {
  "claude-sonnet-4-20250514": 3.0,
  "claude-opus-4-20250514": 15.0,
  "gpt-4o": 2.5,
  "gpt-4.1": 2.0,
  "grok-3": 2.0,
  "grok-3-mini": 0.5,
  "gemini-2.5-pro": 1.25,
  "gemini-2.5-flash": 0.15,
  "llama-3.3-70b-versatile": 0,
  "meta/llama-3.3-70b-instruct": 0,
  default: 1.0,
};

async function parseErrorResponse(res: Response): Promise<string> {
  const txt = await res.text().catch(() => "");
  try {
    const body = JSON.parse(txt) as { error?: string; message?: string; code?: string };
    const raw = body.error ?? body.message ?? txt.slice(0, 280);
    return formatAgentHttpError(raw, body.code);
  } catch {
    return txt.slice(0, 280) || `HTTP ${res.status}`;
  }
}

function estimateCost(model: string, tokens: number): number {
  const costPerM = MODEL_COSTS[model] ?? MODEL_COSTS.default;
  return (tokens / 1_000_000) * costPerM;
}

/** Reducer puro dos eventos SSE (exportado para testes). */
export function applyAgentProgressEvent(prev: AgentProgress, event: SSEEvent): AgentProgress {
  const { type, data } = event;

  switch (type) {
    case "start":
      return {
        ...prev,
        error: null,
        finished: false,
        resumable: false,
        autoResuming: data.autoResume === true,
        statusHint: data.autoResume
          ? "Retomando automaticamente…"
          : data.resume
            ? "Retomando com a memória salva no chat…"
            : "Trabalhando no projeto…",
        timeline: [...prev.timeline, event],
      };

    case "canceled":
      return {
        ...prev,
        finished: true,
        canceled: true,
        resumable: false,
        error: (data.message as string) ?? "Cancelado pelo usuário",
        timeline: [...prev.timeline, event],
      };

    case "assistant_text": {
      const chunk = (data.text as string) ?? "";
      return {
        ...prev,
        streamText: chunk,
        timeline: [...prev.timeline, event],
      };
    }

    case "resume":
      return {
        ...prev,
        autoResuming: true,
        finished: false,
        error: null,
        statusHint: (data.message as string) ?? "Retomando automaticamente no servidor…",
        timeline: [...prev.timeline, event],
      };

    case "phase": {
      const msg = (data.message as string) ?? prev.message;
      return {
        ...prev,
        phase: (data.phase as string) ?? prev.phase,
        message: msg,
        statusHint: msg ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };
    }

    case "step":
      return {
        ...prev,
        currentStep: typeof data.current === "number" ? data.current : prev.currentStep,
        totalSteps: typeof data.total === "number" ? data.total : prev.totalSteps,
        timeline: [...prev.timeline, event],
      };

    case "memory":
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "context_pressure":
    case "context_compress":
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "rate_limit":
      return {
        ...prev,
        statusHint: (data.message as string) ?? "Rate limit — ROBIN alternando chave…",
        timeline: [...prev.timeline, event],
      };

    case "robin_rotate":
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "connection_retry":
      return {
        ...prev,
        statusHint: (data.message as string) ?? "Reconectando ao modelo…",
        timeline: [...prev.timeline, event],
      };

    case "classify":
      return {
        ...prev,
        model: (data.model as string) ?? prev.model,
        timeline: [...prev.timeline, event],
      };

    case "skills":
      return {
        ...prev,
        skills: (data.active as string[]) ?? prev.skills,
        timeline: [...prev.timeline, event],
      };

    case "tool_start":
      return {
        ...prev,
        tools: [
          ...prev.tools,
          {
            name: (data.name as string) ?? "?",
            args: (data.args as Record<string, unknown>) ?? {},
          },
        ],
        timeline: [...prev.timeline, event],
      };

    case "tool_done": {
      const toolName = data.name as string;
      return {
        ...prev,
        tools: prev.tools.map((t) =>
          t.name === toolName ? { ...t, ok: data.ok as boolean, error: data.error as string } : t,
        ),
        cost: prev.cost + estimateCost(prev.model ?? "default", 2000),
        timeline: [...prev.timeline, event],
      };
    }

    case "file_diff": {
      const path = (data.path as string) ?? "unknown";
      const before = (data.before as string) ?? "";
      const after = (data.after as string) ?? "";
      const op = (data.op as "write" | "edit") ?? "write";
      const id = `${path}::${prev.diffs.length}::${Date.now()}`;
      return {
        ...prev,
        diffs: [...prev.diffs, { id, path, before, after, op, timestamp: Date.now() }],
        timeline: [...prev.timeline, event],
      };
    }

    case "validate_ok":
      return {
        ...prev,
        runtimeChecks: [
          ...prev.runtimeChecks,
          ...((data.checks as Array<{ name: string; ok: boolean }>) ?? [
            { name: "build", ok: true },
          ]),
        ],
        timeline: [...prev.timeline, event],
      };

    case "validate_fail": {
      const diags = parseAgentDiagnostics(data);
      pushDiagnostics(diags);
      return {
        ...prev,
        runtimeChecks: [
          ...prev.runtimeChecks,
          ...((data.checks as Array<{ name: string; ok: boolean }>) ?? [
            { name: "build", ok: false },
          ]),
        ],
        timeline: [...prev.timeline, event],
      };
    }

    case "done":
      return {
        ...prev,
        summary: (data.summary as string) ?? prev.summary,
        finished: true,
        awaiting: !!(data.awaiting || data.qualified), // qualify gate or similar
        resumable: false,
        error: null,
        streamText: null,
        pendingPlan: data.planRejected === true || data.planExpired === true
          ? null
          : prev.pendingPlan,
        timeline: [...prev.timeline, event],
      };

    case "plan_proposed": {
      const planId = typeof data.planId === "string" ? data.planId : null;
      const steps = Array.isArray(data.steps) ? (data.steps as PlanStep[]) : [];
      const runId = typeof data.runId === "string" ? data.runId : null;
      const projectId = typeof data.projectId === "string" ? data.projectId : null;
      if (!planId || steps.length === 0 || !runId || !projectId) {
        return { ...prev, timeline: [...prev.timeline, event] };
      }
      const pendingPlan: PendingPlan = {
        planId,
        summary: typeof data.summary === "string" ? data.summary : "Plano proposto",
        rationale: typeof data.rationale === "string" && data.rationale.trim()
          ? data.rationale.trim()
          : undefined,
        steps,
        ttlMs: typeof data.ttlMs === "number" ? data.ttlMs : 5 * 60 * 1000,
        proposedAt: Date.now(),
        runId,
        projectId,
      };
      return {
        ...prev,
        awaiting: true,
        pendingPlan,
        statusHint: "Aguardando sua aprovação do plano…",
        timeline: [...prev.timeline, event],
      };
    }

    case "gate_decision": {
      // Registra a decisão (qualify vs build) para o UI poder mostrar "Agent está perguntando..." vs "construindo".
      const phase = (data.phase as string) || "unknown";
      const reason = (data.reason as string) || "";
      return {
        ...prev,
        awaiting: phase === "qualify" || !!data.awaiting || prev.awaiting,
        // Store last decision so components can surface it (e.g. small caption or log).
        // We extend the interface lightly via the existing timeline + a custom field.
        // For strong typing later we can extend AgentProgress.
        lastGateDecision: { phase, reason, at: Date.now() },
        statusHint: phase === "qualify"
          ? (reason.includes("interaction") ? "Aguardando sua resposta para continuar a conversa..." : "Qualificando a ideia...")
          : prev.statusHint,
        timeline: [...prev.timeline, event],
      };
    }

    case "error":
      return {
        ...prev,
        error: (data.message as string) ?? (data.error as string) ?? "Erro desconhecido",
        finished: true,
        resumable: data.recoverable === true || prev.resumable,
        timeline: [...prev.timeline, event],
      };

    case "finish": {
      const failed = data.ok === false;
      const canceled = !!data.canceled || prev.canceled;
      return {
        ...prev,
        finished: true,
        canceled,
        awaiting: !!(data.awaiting || prev.awaiting),
        streamText: null,
        autoResuming: false,
        lastFinishOk: !failed && !canceled,
        resumable: failed && data.resumable === true && !canceled,
        error: failed || canceled ? ((data.error as string) ?? prev.error) : null,
        pendingQueueCount:
          !failed && !canceled && prev.pendingQueueCount > 0
            ? prev.pendingQueueCount - 1
            : prev.pendingQueueCount,
        timeline: [...prev.timeline, event],
      };
    }

    case "ui_action": {
      const payload = { ...data };
      delete (payload as { type?: string }).type;
      if (isTasteUiAction(payload)) dispatchTasteUiAction(payload);
      return {
        ...prev,
        statusHint: (data.reason as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };
    }

    default:
      return { ...prev, timeline: [...prev.timeline, event] };
  }
}

export function useSSE() {
  const [progress, setProgress] = useState<AgentProgress>(initialState);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const projectIdRef = useRef<string | null>(null);
  type ConnectOnceOpts = {
    watchRunId?: string;
    preserveProgress?: boolean;
  };

  const connectOnce = useCallback(
    async (
      projectId: string,
      conversationId: string,
      sessionKind: ForgeSessionKind | undefined,
      tasteAction: TasteAction | undefined,
      isResume: boolean,
      autoResume: boolean,
      opts?: ConnectOnceOpts & { mode?: "chat" | "plan" | "build" },
    ): Promise<{ shouldAutoResume: boolean; aborted: boolean }> => {
      const sawFinish = { current: false };
      const finishMeta = { resumable: false, ok: true };

      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        setProgress((p) => ({
          ...p,
          error:
            "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
          finished: true,
        }));
        setConnected(false);
        return { shouldAutoResume: false, aborted: false };
      }

      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        setProgress((p) => ({
          ...p,
          error: "Sessão expirada. Faça login novamente.",
          finished: true,
        }));
        setConnected(false);
        return { shouldAutoResume: false, aborted: false };
      }

      runIdRef.current = null;
      projectIdRef.current = projectId;
      const controller = new AbortController();
      abortRef.current = controller;

      const functionsUrl = `${url}/functions/v1/agent-run`;

      setConnected(true);
      logEditorTelemetryEvent("sse", "connect_start", "info", sessionKind ?? "auto");

      try {
        const res = await fetch(functionsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${accessToken}`,
            apikey: publishableKey,
          },
          body: JSON.stringify(
            opts?.watchRunId
              ? {
                  action: "watch",
                  runId: opts.watchRunId,
                  projectId,
                  conversationId,
                }
              : {
                  projectId,
                  conversationId,
                  preferences: loadAgentPreferences(),
                  sessionKind,
                  ...(sessionKind === "taste" && tasteAction ? { tasteAction } : {}),
                  resume: isResume,
                  autoResume,
                  // Fase 4.7: modo opt-in via dropdown (chat/plan/build). Default 'chat' se ausente.
                  mode: opts?.mode ?? "chat",
                  ...loadAgentSessionExtensions(),
                },
          ),
          signal: controller.signal,
        });

        const contentType = res.headers.get("Content-Type") ?? "";
        if (res.ok && contentType.includes("application/json")) {
          const body = (await res.json()) as {
            queued?: boolean;
            message?: string;
            pendingCount?: number;
          };
          if (body.queued) {
            setProgress((p) => ({
              ...p,
              finished: opts?.preserveProgress ? p.finished : true,
              pendingQueueCount: body.pendingCount ?? p.pendingQueueCount + 1,
              statusHint: body.message ?? "Mensagem na fila do agente.",
              error: null,
            }));
            setConnected(false);
            return { shouldAutoResume: false, aborted: false };
          }
        }

        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          logEditorTelemetryEvent(
            "sse",
            "http_error",
            "error",
            `${res.status} ${msg.slice(0, 120)}`,
          );
          const canRetry = res.status === 409 || res.status >= 500;
          setProgress((p) => ({
            ...p,
            error: msg,
            finished: true,
            resumable: canRetry || isResume,
          }));
          setConnected(false);
          return { shouldAutoResume: canRetry, aborted: false };
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setProgress((p) => ({ ...p, error: "Resposta vazia do agent-run", finished: true }));
          setConnected(false);
          return { shouldAutoResume: false, aborted: false };
        }

        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const json = line.slice(6);
              try {
                const parsed = JSON.parse(json) as Record<string, unknown>;
                const eventType = (parsed.type as string) ?? "unknown";
                const eventData =
                  parsed.data && typeof parsed.data === "object"
                    ? (parsed.data as Record<string, unknown>)
                    : { ...parsed, type: undefined };
                const event: SSEEvent = {
                  type: eventType,
                  data: eventData,
                  timestamp: Date.now(),
                };
                if (eventType === "ui_action" && isTasteUiAction(parsed)) {
                  dispatchTasteUiAction(parsed as Parameters<typeof dispatchTasteUiAction>[0]);
                }
                if (event.type === "start" && typeof eventData.runId === "string") {
                  runIdRef.current = eventData.runId;
                }
                if (event.type === "finish" || event.type === "done") {
                  sawFinish.current = true;
                  runIdRef.current = null;
                  finishMeta.ok = eventData.ok !== false;
                  finishMeta.resumable = eventData.resumable === true;
                  logEditorTelemetryEvent("sse", "finish", "ok");
                }
                if (event.type === "error") {
                  logEditorTelemetryEvent(
                    "sse",
                    "stream_error",
                    "error",
                    String(event.data.error ?? "").slice(0, 200),
                  );
                }
                if (event.type === "phase") {
                  logEditorTelemetryEvent("agent", "phase", "info", String(event.data.phase ?? ""));
                }
                setProgress((prev) => applyAgentProgressEvent(prev, event));
              } catch {
                /* heartbeat */
              }
            }
          }
        }
        if (!sawFinish.current) {
          setProgress((p) => ({
            ...p,
            finished: true,
            autoResuming: false,
            resumable: true,
            error:
              p.error ??
              "Conexão com o agente foi interrompida. Retomando automaticamente…",
          }));
          return { shouldAutoResume: true, aborted: false };
        }

        return {
          shouldAutoResume: !finishMeta.ok && finishMeta.resumable,
          aborted: false,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { shouldAutoResume: false, aborted: true };
        }
        setProgress((p) => ({
          ...p,
          error: formatAgentFetchError(err),
          finished: true,
          autoResuming: false,
          resumable: true,
        }));
        return { shouldAutoResume: true, aborted: false };
      } finally {
        setConnected(false);
      }
    },
    [],
  );

  const connect = useCallback(
    async (
      projectId: string,
      conversationId: string,
      sessionKind?: ForgeSessionKind,
      options?: AgentConnectOptions & { tasteAction?: TasteAction },
    ) => {
      const manualResume = options?.resume === true;
      setProgress({
        ...initialState,
        statusHint: manualResume ? "Conectando para retomar o agente…" : null,
        resumable: false,
        autoResuming: false,
      });

      const { aborted } = await connectOnce(
        projectId,
        conversationId,
        sessionKind,
        options?.tasteAction,
        manualResume,
        false,
        { mode: options?.mode },
      );

      if (!aborted) {
        setProgress((p) => ({ ...p, autoResuming: false, pendingQueueCount: 0 }));
      }
    },
    [connectOnce],
  );

  const watch = useCallback(
    async (projectId: string, conversationId: string, runId: string) => {
      setProgress((p) => ({
        ...p,
        finished: false,
        error: null,
        resumable: false,
        statusHint: "Conectando ao agente em execução…",
      }));

      const { aborted } = await connectOnce(
        projectId,
        conversationId,
        undefined,
        undefined,
        false,
        false,
        { watchRunId: runId },
      );

      if (!aborted) {
        setProgress((p) => ({ ...p, autoResuming: false }));
      }
    },
    [connectOnce],
  );

  const queueMessage = useCallback(
    async (
      projectId: string,
      conversationId: string,
      sessionKind?: ForgeSessionKind,
      tasteAction?: TasteAction,
    ): Promise<{ ok: boolean; pendingCount?: number; message?: string }> => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        return { ok: false, message: "Supabase não configurado." };
      }
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) return { ok: false, message: "Sessão expirada." };

      const res = await fetch(`${url}/functions/v1/agent-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({
          projectId,
          conversationId,
          preferences: loadAgentPreferences(),
          sessionKind,
          ...(sessionKind === "taste" && tasteAction ? { tasteAction } : {}),
          ...loadAgentSessionExtensions(),
        }),
      });

      if (!res.ok) {
        const msg = await parseErrorResponse(res);
        return { ok: false, message: msg };
      }

      const body = (await res.json()) as {
        queued?: boolean;
        pendingCount?: number;
        message?: string;
      };
      if (body.queued) {
        setProgress((p) => ({
          ...p,
          pendingQueueCount: body.pendingCount ?? p.pendingQueueCount + 1,
          statusHint: body.message ?? "Mensagem na fila do agente.",
        }));
        return { ok: true, pendingCount: body.pendingCount, message: body.message };
      }
      return { ok: false, message: "Agente livre — use run normal." };
    },
    [],
  );

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    runIdRef.current = null;
    setConnected(false);
    setProgress((p) => ({ ...p, finished: true }));
  }, []);

  /** Aborta o SSE e solicita cancelamento server-side (C22). */
  const stop = useCallback(async () => {
    const runId = runIdRef.current;
    if (runId) {
      try {
        await cancelAgentRun(runId);
        logEditorTelemetryEvent("agent", "cancel_request", "info", runId.slice(0, 8));
      } catch {
        /* edge pode já ter encerrado */
      }
      runIdRef.current = null;
    }
    abortRef.current?.abort();
    setConnected(false);
    setProgress((p) => ({ ...p, finished: true, resumable: false }));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const replay = useCallback(
    async (projectId: string, conversationId: string, runId: string) => {
      setProgress({
        ...initialState,
        statusHint: `Replaying run ${runId.slice(0, 8)}…`,
        resumable: false,
        autoResuming: false,
      });

      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        setProgress((p) => ({ ...p, error: "Supabase não configurado", finished: true }));
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        setProgress((p) => ({ ...p, error: "Sessão expirada", finished: true }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setConnected(true);

      try {
        const res = await fetch(`${url}/functions/v1/agent-run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${accessToken}`,
            apikey: publishableKey,
          },
          body: JSON.stringify({ action: "replay", runId, projectId, conversationId }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          setProgress((p) => ({ ...p, error: msg, finished: true }));
          setConnected(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setProgress((p) => ({ ...p, error: "Replay vazio", finished: true }));
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
                const eventType = (parsed.type as string) ?? "unknown";
                const eventData =
                  parsed.data && typeof parsed.data === "object"
                    ? (parsed.data as Record<string, unknown>)
                    : { ...parsed, type: undefined };
                const event: SSEEvent = {
                  type: eventType,
                  data: eventData,
                  timestamp: Date.now(),
                };
                if (eventType === "replay_start") {
                  setProgress((p) => ({
                    ...p,
                    statusHint: `Replaying ${(eventData.totalEvents as number) ?? 0} eventos…`,
                  }));
                } else {
                  setProgress((prev) => applyAgentProgressEvent(prev, event));
                }
              } catch {
                /* heartbeat */
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setProgress((p) => ({
          ...p,
          error: formatAgentFetchError(err),
          finished: true,
        }));
      } finally {
        setConnected(false);
      }
    },
    [],
  );

  const approvePlan = useCallback(
    async (
      projectId: string,
      runId: string,
      planId: string,
      steps: PlanStep[],
    ): Promise<PlanApproveResult> => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        return { ok: false, message: "Supabase não configurado." };
      }
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        return { ok: false, message: "Sessão expirada." };
      }

      try {
        const res = await fetch(`${url}/functions/v1/agent-run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: publishableKey,
          },
          body: JSON.stringify({ action: "plan_approve", runId, planId, steps }),
        });
        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          return { ok: false, message: msg };
        }
        const body = (await res.json()) as {
          ok?: boolean;
          steps?: PlanStep[];
          resolvedInProcess?: boolean;
        };
        setProgress((p) => ({ ...p, pendingPlan: null, statusHint: "Plano aprovado — executando…" }));
        return {
          ok: body.ok !== false,
          resolvedInProcess: body.resolvedInProcess === true,
          steps: body.steps,
        };
      } catch (err) {
        return { ok: false, message: formatAgentFetchError(err) };
      }
    },
    [],
  );

  const rejectPlan = useCallback(
    async (
      projectId: string,
      runId: string,
      planId: string,
      reason?: string,
    ): Promise<PlanRejectResult> => {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        return { ok: false, message: "Supabase não configurado." };
      }
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        return { ok: false, message: "Sessão expirada." };
      }

      try {
        const res = await fetch(`${url}/functions/v1/agent-run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: publishableKey,
          },
          body: JSON.stringify({ action: "plan_reject", runId, planId, reason }),
        });
        if (!res.ok) {
          const msg = await parseErrorResponse(res);
          return { ok: false, message: msg };
        }
        const body = (await res.json()) as {
          ok?: boolean;
          resolvedInProcess?: boolean;
        };
        setProgress((p) => ({
          ...p,
          pendingPlan: null,
          statusHint: "Plano rejeitado.",
          finished: true,
        }));
        return { ok: body.ok !== false, resolvedInProcess: body.resolvedInProcess === true };
      } catch (err) {
        return { ok: false, message: formatAgentFetchError(err) };
      }
    },
    [],
  );

  return { progress, connected, connect, watch, replay, queueMessage, disconnect, stop, approvePlan, rejectPlan };
}

/** Resposta do plan_approve/plan_reject edge function. */
export type PlanDecisionResult = {
  ok: boolean;
  message?: string;
  /** true se o resolver in-process foi disparado (vs polling cross-process). */
  resolvedInProcess?: boolean;
};

/** Resposta do plan_approve/plan_reject edge function (alias semântico). */
export type PlanApproveResult = PlanDecisionResult & { steps?: PlanStep[] };
export type PlanRejectResult = PlanDecisionResult;
