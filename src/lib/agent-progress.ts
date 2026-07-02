import { parseAgentDiagnostics, pushDiagnostics } from "@/hooks/useDiagnostics";
import { dispatchTasteUiAction, isTasteUiAction } from "@/lib/taste-ui-actions";
import type { AgentStreamEventData } from "@/lib/agent-event-contract";
import { applyToolDoneRow, applyToolStartRow } from "@/lib/tool-invocation-ledger";

export type TerminalPhase = "running" | "closing" | "terminal";

export function resolveTerminalPhase(
  progress: Pick<AgentProgress, "terminalPhase" | "finished">,
): TerminalPhase {
  if (progress.terminalPhase === "closing") return "closing";
  if (progress.finished || progress.terminalPhase === "terminal") return "terminal";
  return "running";
}

/** Inspector/mini-card: tools só “ativos” enquanto o job está em `running`. */
export function resolveForgeTimelineActive(
  progress: Pick<AgentProgress, "terminalPhase" | "finished">,
  slotActive: boolean,
): boolean {
  return slotActive && resolveTerminalPhase(progress) === "running";
}

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

export type AwaitingKind = "clarify" | "plan_approval" | null;

/** Tarefa atômica declarada pelo LLM (build mode via declare_tasks tool) ou
 *  derivada de PendingPlan.steps (plan mode). Estado para o mini-card checklist. */
export type AgentTaskStatus = "pending" | "active" | "done" | "failed";

export interface AgentTask {
  id: string;
  label: string;
  criteria?: string;
  status: AgentTaskStatus;
}

/** Rehydrate awaiting gate from agent_runs.meta.awaitingUser (post-F5 / catch-up). */
export function awaitingKindFromRunMeta(
  meta: Record<string, unknown> | null | undefined,
): AwaitingKind {
  const awaitingUser = meta?.awaitingUser as { type?: string } | undefined;
  if (awaitingUser?.type === "plan_approval") return "plan_approval";
  if (awaitingUser?.type === "clarify" || awaitingUser?.type === "qualify") return "clarify";
  return null;
}

export interface DesignReference {
  url: string;
  title?: string;
  screenshot_url?: string;
}

export interface DesignPlanField {
  voice: string[];
  moment: string;
  techniques: string[];
  mood?: string;
  references?: DesignReference[];
  anti_patterns?: string[];
  synthesis_reasoning?: string;
  relevant_dnas?: string[];
  compositions?: string[];
  composition_exports?: string[];
  read_paths?: string[];
}

export interface PendingPlan {
  planId: string;
  summary: string;
  rationale?: string;
  markdown?: string;
  mission?: string;
  objective?: string;
  steps: PlanStep[];
  design?: DesignPlanField;
  ttlMs: number;
  proposedAt: number;
  runId: string;
  projectId: string;
}

export interface AgentProgress {
  mode?: "chat" | "plan" | "build";
  phase: string | null;
  message: string | null;
  currentStep: number | null;
  totalSteps: number | null;
  tools: Array<{
    name: string;
    args: Record<string, unknown>;
    ok?: boolean;
    error?: string;
    toolCallId?: string;
  }>;
  cost: number;
  model: string | null;
  skills: string[];
  runtimeChecks: Array<{ name: string; ok: boolean }>;
  timeline: SSEEvent[];
  summary: string | null;
  error: string | null;
  finished: boolean;
  /** Fase terminal do stream — `closing` após `done` build; `terminal` após `finish`. */
  terminalPhase?: TerminalPhase;
  resumable: boolean;
  statusHint: string | null;
  streamText: string | null;
  lastFinishOk: boolean | null;
  pendingQueueCount: number;
  diffs: Array<{
    id: string;
    path: string;
    before: string;
    after: string;
    op: "write" | "edit";
    timestamp: number;
  }>;
  pendingPlan: PendingPlan | null;
  canceled?: boolean;
  awaiting?: boolean;
  awaitingKind?: AwaitingKind;
  /** Incrementado quando o agente altera ficheiros — cliente deve force-sync preview. */
  previewSyncTick?: number;
  /** Paths entregues parcialmente (meta persistida / replay). */
  deliveryFiles?: string[];
  /** Linhas de saída Gradle/shell (preview nativo). */
  buildLogLines?: Array<{ command: string; line: string; ok: boolean; ts: number }>;
  /** Sugestão de fork quando mobile nativo aparece em projeto web. */
  stackForkSuggested?: {
    path: string;
    suggestedStack: string;
    message: string;
  } | null;
  /** Texto de narração do agente (briefing inicial, wrap-up final) — separado de streamText para não poluir tool calls. */
  narrationText?: string | null;
  /** Duração congelada da linha «Pensou por Xs» — setada uma vez ao 1º conteúdo visível. */
  workingDurationMs?: number | null;
  /** Texto privado do raciocínio do LLM — vai só pro Inspector, nunca pro thread do chat. */
  privateThoughtText?: string | null;
  /** Estado atual da FSM do agente (FORGE 2.0). */
  fsmState?: string | null;
  /** Sumário do último plano proposto (FORGE 2.0). */
  planSummary?: string | null;
  /** Turno social/conversacional — só bubble no chat, sem mini-card de job. */
  conversational?: boolean;
  /** Estado da conexão Realtime — usado para feedback visual durante reconnect
   *  (Fase 1.6: «Reconectando…» no ChatThinking enquanto o canal refaz handshake). */
  connectionState?: "connected" | "reconnecting" | "disconnected";
  /** Session 2.0 — tokens consumidos pela run (lidos do finish/done enriquecido). */
  tokens?: { input: number; output: number; total: number } | null;
  /** Session 2.0 — complexidade classificada pelo agente (lida de classify). */
  classifyComplexity?: string | null;
  /** Session 2.0 — sumário da classificação (lido de classify). */
  classifySummary?: string | null;
  /** Session 2.0 — true quando classify indicou checkpoint restaurado. */
  classifyRestored?: boolean;
  /** Clarify multi-pergunta — questões estruturadas vindas do edge function. */
  clarifyQuestions?: Array<{
    id: string;
    intro?: string;
    question: string;
    multiple?: boolean;
    choices: Array<{ id: string; label: string; description?: string }>;
  }>;
  /** Tarefas atômicas declaradas (build mode via declare_tasks, ou derivadas de plano aprovado).
   *  Alimenta o checklist do mini-card. */
  tasks?: AgentTask[];
  /** Janela de contexto — uso em tempo real (dot do composer). */
  contextUsage?: {
    usageTokens: number;
    windowTokens: number;
    percent: number;
    mode: "manual" | "auto";
    compacting: boolean;
  } | null;
}

export type AgentConnectOptions = {
  resume?: boolean;
  mode?: "chat" | "plan" | "build";
};

export const initialAgentProgress: AgentProgress = {
  mode: undefined,
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
  summary: null,
  error: null,
  finished: false,
  terminalPhase: "running",
  resumable: false,
  statusHint: null,
  streamText: null,
  narrationText: null,
  workingDurationMs: null,
  lastFinishOk: null,
  pendingQueueCount: 0,
  diffs: [],
  pendingPlan: null,
  awaitingKind: null,
  canceled: false,
  awaiting: false,
  fsmState: null,
  planSummary: null,
  tokens: null,
  classifyComplexity: null,
  classifySummary: null,
  classifyRestored: false,
  tasks: [],
};

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

function estimateCost(model: string, tokens: number): number {
  const costPerM = MODEL_COSTS[model] ?? MODEL_COSTS.default;
  return (tokens / 1_000_000) * costPerM;
}

/** Converts a persisted stream row into the flat SSE shape the reducer expects. */
export function streamRowToSSEEvent(row: {
  event_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
  seq?: number;
}): SSEEvent {
  const payload = row.payload ?? {};
  const eventType = (payload.type as string) ?? row.event_type;
  const eventData =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : { ...payload, type: undefined };
  return {
    type: eventType,
    data: eventData,
    timestamp: row.created_at ? Date.parse(row.created_at) : Date.now(),
  };
}

function parsePendingPlanFromPayload(
  source: Record<string, unknown>,
  fallback?: { runId?: string | null; projectId?: string | null },
): PendingPlan | null {
  const nested =
    source.plan && typeof source.plan === "object"
      ? (source.plan as Record<string, unknown>)
      : source;
  const planId = typeof nested.planId === "string" ? nested.planId : null;
  const steps = Array.isArray(nested.steps) ? (nested.steps as PlanStep[]) : [];
  const runId =
    typeof nested.runId === "string"
      ? nested.runId
      : typeof fallback?.runId === "string"
        ? fallback.runId
        : null;
  const projectId =
    typeof nested.projectId === "string"
      ? nested.projectId
      : typeof fallback?.projectId === "string"
        ? fallback.projectId
        : null;
  if (!planId || steps.length === 0 || !runId || !projectId) return null;

  return {
    planId,
    summary: typeof nested.summary === "string" ? nested.summary : "Plano proposto",
    rationale:
      typeof nested.rationale === "string" && nested.rationale.trim()
        ? nested.rationale.trim()
        : undefined,
    markdown:
      typeof nested.markdown === "string" && nested.markdown.trim()
        ? nested.markdown.trim()
        : undefined,
    mission: typeof nested.mission === "string" ? nested.mission : undefined,
    objective: typeof nested.objective === "string" ? nested.objective : undefined,
    steps,
    // Session 2.0: ttlMs default 60s (antes MAX_SAFE_INTEGER — nunca expirava).
    ttlMs: typeof nested.ttlMs === "number" ? nested.ttlMs : 60_000,
    // Session 2.0: proposedAt lido do payload (ISO string) se presente.
    proposedAt:
      typeof nested.proposedAt === "string" && nested.proposedAt
        ? Date.parse(nested.proposedAt) || Date.now()
        : Date.now(),
    runId,
    projectId,
    design:
      nested.design && typeof nested.design === "object"
        ? parseDesignPlanField(nested.design as Record<string, unknown>)
        : undefined,
  };
}

function parseDesignPlanField(d: Record<string, unknown>): DesignPlanField {
  const voice = Array.isArray(d.voice)
    ? (d.voice as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const moment = typeof d.moment === "string" ? d.moment : "";
  const techniques = Array.isArray(d.techniques)
    ? (d.techniques as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const references: DesignReference[] = Array.isArray(d.references)
    ? (d.references as unknown[])
        .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
        .map((r) => ({
          url: typeof r.url === "string" ? r.url : "",
          title: typeof r.title === "string" ? r.title : undefined,
          screenshot_url: typeof r.screenshot_url === "string" ? r.screenshot_url : undefined,
        }))
        .filter((r) => r.url)
    : [];
  return {
    voice,
    moment,
    techniques,
    mood: typeof d.mood === "string" ? d.mood : undefined,
    references: references.length > 0 ? references : undefined,
    anti_patterns: Array.isArray(d.anti_patterns)
      ? (d.anti_patterns as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    synthesis_reasoning:
      typeof d.synthesis_reasoning === "string" ? d.synthesis_reasoning : undefined,
    relevant_dnas: Array.isArray(d.relevant_dnas)
      ? (d.relevant_dnas as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    compositions: Array.isArray(d.compositions)
      ? (d.compositions as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    composition_exports: Array.isArray(d.composition_exports)
      ? (d.composition_exports as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    read_paths: Array.isArray(d.read_paths)
      ? (d.read_paths as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
  };
}

/** Reducer puro dos eventos do agente (exportado para testes). */
export function applyAgentProgressEvent(prev: AgentProgress, event: SSEEvent): AgentProgress {
  const { type, data } = event;

  switch (type) {
    case "start": {
      const modeRaw = data.mode;
      const mode =
        modeRaw === "chat" || modeRaw === "plan" || modeRaw === "build" ? modeRaw : undefined;
      return {
        ...initialAgentProgress,
        pendingQueueCount: prev.pendingQueueCount,
        error: null,
        finished: false,
        terminalPhase: "running",
        resumable: false,
        statusHint: mode === "chat" ? "Respondendo…" : "Trabalhando no projeto…",
        conversational: mode === "chat" ? true : prev.conversational,
        mode,
        timeline: [event],
      };
    }

    case "canceled":
      return {
        ...prev,
        finished: true,
        terminalPhase: "terminal",
        canceled: true,
        resumable: false,
        error: (data.message as string) ?? "Cancelado pelo usuário",
        timeline: [...prev.timeline, event],
      };

    case "assistant_text": {
      const chunk = (data.text as string) ?? "";
      const append = data.append === true || data.delta === true;
      const opening = data.opening === true;
      const narration = data.narration === true || opening;
      const thinking = data.thinking === true;
      const isFinal = data.final === true;
      // Fase 2.2 — fechamento final sempre vira streamText, nunca descartado.
      const skipStream = !isFinal && (narration || thinking || opening);
      return {
        ...prev,
        streamText: skipStream
          ? prev.streamText
          : append
            ? `${prev.streamText ?? ""}${chunk}`
            : chunk,
        narrationText: narration
          ? append && !opening
            ? `${prev.narrationText ?? ""}${chunk}`
            : opening && prev.narrationText?.trim()
              ? prev.narrationText
              : chunk
          : prev.narrationText,
        timeline: [...prev.timeline, event],
      };
    }

    case "thinking_text": {
      const chunk = (data.text as string) ?? "";
      const append = data.append === true || data.delta === true;
      return {
        ...prev,
        privateThoughtText: append ? `${prev.privateThoughtText ?? ""}${chunk}` : chunk,
        timeline: [...prev.timeline, event],
      };
    }

    case "phase": {
      const msg = (data.message as string) ?? prev.message;
      const phase = (data.phase as string) ?? prev.phase;
      const compacting = phase === "compact";
      return {
        ...prev,
        phase,
        message: msg,
        statusHint: msg ?? prev.statusHint,
        contextUsage: prev.contextUsage
          ? { ...prev.contextUsage, compacting: compacting || prev.contextUsage.compacting }
          : compacting
            ? {
                usageTokens: 0,
                windowTokens: 0,
                percent: 0,
                mode: "manual",
                compacting: true,
              }
            : prev.contextUsage,
        timeline: [...prev.timeline, event],
      };
    }

    case "explore": {
      const msg = (data.message as string) ?? prev.message;
      return {
        ...prev,
        message: msg ?? prev.message,
        statusHint: msg ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };
    }

    case "agent_note": {
      const text = (data.text as string) ?? "";
      return {
        ...prev,
        privateThoughtText: prev.privateThoughtText,
        // agent_note é comunicação intencional do LLM — fica na timeline, não no chat.
        timeline: [...prev.timeline, event],
      };
    }

    case "alert":
    case "design":
      return {
        ...prev,
        timeline: [...prev.timeline, event],
      };

    case "step_result":
      return {
        ...prev,
        timeline: [...prev.timeline, event],
      };

    case "step":
      return {
        ...prev,
        currentStep: typeof data.current === "number" ? data.current : prev.currentStep,
        totalSteps: typeof data.total === "number" ? data.total : prev.totalSteps,
        timeline: [...prev.timeline, event],
      };

    case "task": {
      const id = String(data.id ?? "");
      const label = String(data.label ?? "");
      if (!id || !label) return { ...prev, timeline: [...prev.timeline, event] };
      const status: AgentTaskStatus = data.failed === true
        ? "failed"
        : data.done === true
          ? "done"
          : data.active === true
            ? "active"
            : "pending";
      const task: AgentTask = {
        id,
        label,
        criteria: typeof data.criteria === "string" ? data.criteria : undefined,
        status,
      };
      const existing = prev.tasks ?? [];
      const idx = existing.findIndex((t) => t.id === id);
      const tasks = idx >= 0
        ? [...existing.slice(0, idx), task, ...existing.slice(idx + 1)]
        : [...existing, task];
      return { ...prev, tasks, timeline: [...prev.timeline, event] };
    }

    case "context_usage":
      return {
        ...prev,
        contextUsage: {
          usageTokens: typeof data.usageTokens === "number" ? data.usageTokens : 0,
          windowTokens: typeof data.windowTokens === "number" ? data.windowTokens : 0,
          percent: typeof data.percent === "number" ? data.percent : 0,
          mode: data.mode === "auto" ? "auto" : "manual",
          compacting: data.compacting === true,
        },
        timeline: [...prev.timeline, event],
      };

    case "context_compact_done":
      return {
        ...prev,
        contextUsage: prev.contextUsage
          ? {
              ...prev.contextUsage,
              usageTokens:
                typeof data.afterTokens === "number"
                  ? data.afterTokens
                  : prev.contextUsage.usageTokens,
              percent:
                typeof data.percentAfter === "number"
                  ? data.percentAfter
                  : prev.contextUsage.percent,
              compacting: false,
            }
          : prev.contextUsage,
        timeline: [...prev.timeline, event],
      };

    case "rate_limit":
      return {
        ...prev,
        statusHint: (data.message as string) ?? "Rate limit — ROBIN alternando chave…",
        timeline: [...prev.timeline, event],
      };

    case "robin_rotate":
    case "connection_retry":
    case "heartbeat":
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "build_log": {
      const command = typeof data.command === "string" ? data.command : "gradle";
      const ok = data.ok !== false;
      const rawLines = Array.isArray(data.lines)
        ? (data.lines as string[]).filter((l) => typeof l === "string" && l.trim())
        : typeof data.output === "string"
          ? data.output.split("\n").filter((l) => l.trim())
          : [];
      const ts = Date.now();
      const appended = rawLines.map((line) => ({
        command,
        line: line.trim(),
        ok,
        ts,
      }));
      return {
        ...prev,
        buildLogLines: [...(prev.buildLogLines ?? []), ...appended].slice(-120),
        timeline: [...prev.timeline, event],
      };
    }

    case "stack_fork_suggested":
      return {
        ...prev,
        stackForkSuggested: {
          path: String(data.path ?? "app/build.gradle.kts"),
          suggestedStack: String(data.suggestedStack ?? "android-native"),
          message:
            (data.message as string) ?? "Isso é mobile nativo. Criar projeto Android dedicado?",
        },
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
        tools: applyToolStartRow(prev.tools, {
          name: (data.name as string) ?? "?",
          args: (data.args as Record<string, unknown>) ?? {},
          toolCallId: typeof data.toolCallId === "string" ? data.toolCallId : undefined,
        }),
        timeline: [...prev.timeline, event],
      };

    case "tool_done": {
      const toolName = data.name as string;
      const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : null;
      return {
        ...prev,
        tools: applyToolDoneRow(prev.tools, {
          name: toolName,
          toolCallId,
          ok: data.ok as boolean,
          error: data.error as string,
        }),
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
        diffs: [
          ...prev.diffs,
          {
            id,
            path,
            before,
            after,
            op,
            timestamp: Date.now(),
          },
        ],
        previewSyncTick: (prev.previewSyncTick ?? 0) + 1,
        timeline: [...prev.timeline, event],
      };
    }

    case "done": {
      // Session 2.0: `finish` continua sendo o terminal canônico do stream.
      // `done` materializa o estado de plan/clarify/conversational no cache local
      // para a UI não ficar presa em "working" até o refresh/replay.
      const summary = (data.summary as string) ?? prev.summary;
      const summaryTrim = summary?.trim() ?? "";
      const summaryIsRobotic = /pronto!?\s*resumo do que fiz|nenhum arquivo foi alterado/i.test(
        summaryTrim.replace(/\*+/g, ""),
      );
      const streamText = prev.streamText?.trim()
        ? prev.streamText
        : summaryTrim && !summaryIsRobotic
          ? summaryTrim
          : prev.streamText;
      const planFromDone =
        data.planProposed === true && !data.planRejected ? parsePendingPlanFromPayload(data) : null;
      const pendingPlan = data.planRejected === true ? null : (prev.pendingPlan ?? planFromDone);
      const planAwaiting = data.planProposed === true && !!pendingPlan;
      const planLifecycleEvent = data.planProposed === true || data.planRejected === true;
      const conversational = data.conversational === true;
      const materializedTerminal =
        conversational ||
        data.awaiting === true ||
        data.qualified === true;
      const totalInputTokens =
        typeof data.totalInputTokens === "number" ? data.totalInputTokens : prev.tokens?.input;
      const totalOutputTokens =
        typeof data.totalOutputTokens === "number" ? data.totalOutputTokens : prev.tokens?.output;
      const totalTokens =
        typeof data.totalTokens === "number" ? data.totalTokens : prev.tokens?.total;
      const costUsd = typeof data.costUsd === "number" ? data.costUsd : prev.cost;
      const enterClosing =
        !planLifecycleEvent && !materializedTerminal && !planAwaiting && !conversational;
      return {
        ...prev,
        summary,
        finished: (materializedTerminal && !planLifecycleEvent) || prev.finished,
        terminalPhase: materializedTerminal || planLifecycleEvent
          ? "terminal"
          : enterClosing
            ? "closing"
            : prev.terminalPhase ?? "running",
        awaiting: conversational ? false : !!(data.awaiting || data.qualified) || planAwaiting,
        awaitingKind: conversational
          ? null
          : data.qualified || data.awaiting
            ? "clarify"
            : planAwaiting
              ? "plan_approval"
              : null,
        streamText,
        pendingPlan: conversational ? null : pendingPlan,
        planSummary: conversational ? null : (pendingPlan?.summary ?? prev.planSummary),
        conversational,
        statusHint: planAwaiting ? "Plano aguardando aprovação…" : prev.statusHint,
        tokens:
          totalInputTokens != null || totalOutputTokens != null || totalTokens != null
            ? {
                input: totalInputTokens ?? 0,
                output: totalOutputTokens ?? 0,
                total: totalTokens ?? 0,
              }
            : prev.tokens,
        cost: costUsd,
        timeline: [...prev.timeline, event],
      };
    }

    case "plan_proposed": {
      const pendingPlan = parsePendingPlanFromPayload(data);
      if (!pendingPlan) {
        return { ...prev, timeline: [...prev.timeline, event] };
      }
      return {
        ...prev,
        awaiting: true,
        awaitingKind: "plan_approval",
        pendingPlan,
        planSummary: pendingPlan.summary,
        statusHint: "Plano aguardando aprovação…",
        timeline: [...prev.timeline, event],
      };
    }

    case "error":
      return {
        ...prev,
        error: (data.message as string) ?? (data.error as string) ?? "Erro desconhecido",
        finished: true,
        terminalPhase: "terminal",
        resumable: data.recoverable === true || prev.resumable,
        timeline: [...prev.timeline, event],
      };

    case "finish": {
      const failed = data.ok === false;
      const canceled = !!data.canceled || prev.canceled;
      const awaiting = !!(data.awaiting || data.qualified || prev.awaiting);
      const planPending =
        prev.awaitingKind === "plan_approval" && (prev.pendingPlan?.steps?.length ?? 0) > 0;
      const totalInputTokens =
        typeof data.totalInputTokens === "number" ? data.totalInputTokens : prev.tokens?.input;
      const totalOutputTokens =
        typeof data.totalOutputTokens === "number" ? data.totalOutputTokens : prev.tokens?.output;
      const totalTokens =
        typeof data.totalTokens === "number" ? data.totalTokens : prev.tokens?.total;
      const costUsd = typeof data.costUsd === "number" ? data.costUsd : prev.cost;
      const summary =
        typeof data.summary === "string" && data.summary.trim() ? data.summary : prev.summary;
      return {
        ...prev,
        finished: true,
        terminalPhase: "terminal",
        canceled,
        awaiting,
        awaitingKind: awaiting
          ? planPending
            ? "plan_approval"
            : data.qualified ||
                data.awaiting ||
                prev.awaitingKind === "clarify" ||
                (prev.awaitingKind as string | null) === "qualify"
              ? "clarify"
              : prev.awaitingKind === "plan_approval"
                ? "plan_approval"
                : null
          : prev.awaitingKind,
        streamText:
          failed || canceled
            ? prev.streamText?.trim() ||
              (typeof data.error === "string" ? data.error : null) ||
              prev.error
            : prev.streamText,
        lastFinishOk: !failed && !canceled,
        resumable: awaiting
          ? true
          : failed && data.resumable === true && !canceled,
        error: failed || canceled ? ((data.error as string) ?? prev.error) : null,
        summary,
        tokens:
          totalInputTokens != null || totalOutputTokens != null || totalTokens != null
            ? {
                input: totalInputTokens ?? 0,
                output: totalOutputTokens ?? 0,
                total: totalTokens ?? 0,
              }
            : prev.tokens,
        cost: costUsd,
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

    case "fsm_transition":
      return {
        ...prev,
        fsmState: (data.stateName as string) ?? prev.fsmState,
        timeline: [...prev.timeline, event],
      };

    // ─── Session 2.0 — novos handlers ──────────────────────────────────────

    case "stuck":
      return {
        ...prev,
        statusHint: (data.message as string) ?? "Modelo preso — tentando destravar…",
        timeline: [...prev.timeline, event],
      };

    case "run_paused":
      return {
        ...prev,
        resumable: true,
        statusHint:
          (data.message as string) ?? "Execução pausada — use Continuar para retomar.",
        timeline: [...prev.timeline, event],
      };

    default:
      return { ...prev, timeline: [...prev.timeline, event] };
  }
}
