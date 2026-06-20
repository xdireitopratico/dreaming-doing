import { parseAgentDiagnostics, pushDiagnostics } from "@/hooks/useDiagnostics";
import { dispatchTasteUiAction, isTasteUiAction } from "@/lib/taste-ui-actions";

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
  phase: string | null;
  message: string | null;
  currentStep: number | null;
  totalSteps: number | null;
  tools: Array<{
    name: string;
    args: Record<string, unknown>;
    ok?: boolean;
    error?: string;
  }>;
  cost: number;
  model: string | null;
  skills: string[];
  runtimeChecks: Array<{ name: string; ok: boolean }>;
  timeline: SSEEvent[];
  summary: string | null;
  error: string | null;
  finished: boolean;
  resumable: boolean;
  statusHint: string | null;
  streamText: string | null;
  lastFinishOk: boolean | null;
  autoResuming: boolean;
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
  /** Paths entregues no último delivery_checkpoint (contrato parcial). */
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
  /** Duração congelada do «Thought for Xs» de latência — permanece no chat após o 1º token. */
  latencyThoughtMs?: number | null;
  /** Texto privado do raciocínio do LLM — vai só pro Inspector, nunca pro thread do chat. */
  privateThoughtText?: string | null;
  /** Estado atual da FSM do agente (FORGE 2.0). */
  fsmState?: string | null;
  /** Sumário do último plano proposto (FORGE 2.0). */
  planSummary?: string | null;
  /** Chips de status materializados no cardSnapshot — permanecem pós-F5 (Lovable img 15). */
  statusChips?: string[];
  /** Turno social/conversacional — só bubble no chat, sem mini-card de job. */
  conversational?: boolean;
  /** Estado da conexão Realtime — usado para feedback visual durante reconnect
   *  (Fase 1.6: «Reconectando…» no ChatThinking enquanto o canal refaz handshake). */
  connectionState?: "connected" | "reconnecting" | "disconnected";
}

export type AgentConnectOptions = {
  resume?: boolean;
  mode?: "plan" | "build";
};

export const initialAgentProgress: AgentProgress = {
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
  resumable: false,
  statusHint: null,
  streamText: null,
  narrationText: null,
  latencyThoughtMs: null,
  lastFinishOk: null,
  autoResuming: false,
  pendingQueueCount: 0,
  diffs: [],
  pendingPlan: null,
  awaitingKind: null,
  canceled: false,
  awaiting: false,
  fsmState: null,
  planSummary: null,
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
    ttlMs: typeof nested.ttlMs === "number" ? nested.ttlMs : Number.MAX_SAFE_INTEGER,
    proposedAt: Date.now(),
    runId,
    projectId,
    design: nested.design && typeof nested.design === "object"
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
    synthesis_reasoning: typeof d.synthesis_reasoning === "string" ? d.synthesis_reasoning : undefined,
    relevant_dnas: Array.isArray(d.relevant_dnas)
      ? (d.relevant_dnas as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
  };
}

/** Reducer puro dos eventos do agente (exportado para testes). */
export function applyAgentProgressEvent(prev: AgentProgress, event: SSEEvent): AgentProgress {
  const { type, data } = event;

  switch (type) {
    case "start":
      return {
        ...initialAgentProgress,
        pendingQueueCount: prev.pendingQueueCount,
        error: null,
        finished: false,
        resumable: false,
        statusHint: "Trabalhando no projeto…",
        timeline: [event],
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
      const append = data.append === true || data.delta === true;
      const opening = data.opening === true;
      const narration = data.narration === true || opening;
      const thinking = data.thinking === true;
      const skipStream = narration || thinking || opening;
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
        privateThoughtText: append
          ? `${prev.privateThoughtText ?? ""}${chunk}`
          : chunk,
        timeline: [...prev.timeline, event],
      };
    }

    /**
     * GAP 1 — PR 1 (T1.5 — sem feature flag por enquanto).
     *
     * Esta é a segunda camada de defesa contra o vazamento de
     * raciocínio do LLM pro chat:
     *
     *   1ª camada (servidor): `thinking_text` event é emitido em
     *      ADIÇÃO ao `assistant_text { thinking: true }` legado, não
     *      em substituição — zero risco de regressão.
     *   2ª camada (este case): `privateThoughtText` acumula o
     *      thinking em campo dedicado, separado de `streamText`/
     *      `narrationText`. Vai pro Inspector.
     *   3ª camada (turn-display.ts): `resolveTurnThinking` ignora
     *      `assistant_text { thinking: true }` como evidência de
     *      "1º token" — o chip "Thought for Xs" não dispara a partir
     *      do pensamento, só do chat real.
     *   4ª camada (forge-run.ts): `buildForgeTimeline` aceita
     *      `thinking_text` como source pra `THOUGHT` items do
     *      Inspector.
     *
     * Nenhuma das 4 camadas remove o caminho legado. A migração pra
     * usar SÓ `thinking_text` no chat é um PR futuro (PR 4), com
     * feature flag dedicada (`chat.thinkingStreamIsolated`). Por
     * enquanto, ambas as fontes coexistem com comportamento
     * idêntico.
     */

    case "resume":
      return {
        ...prev,
        finished: false,
        error: null,
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

    case "explore": {
      const msg = (data.message as string) ?? prev.message;
      return {
        ...prev,
        message: msg ?? prev.message,
        statusHint: msg ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };
    }

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

    case "memory":
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

    case "delivery_checkpoint": {
      const narration = typeof data.narration === "string" ? data.narration.trim() : "";
      const deliveryFiles = Array.isArray(data.deliveryFiles)
        ? (data.deliveryFiles as string[]).filter((p) => typeof p === "string")
        : prev.deliveryFiles;
      const silent = data.silent === true;
      return {
        ...prev,
        finished: false,
        error: null,
        currentStep: typeof data.step === "number" ? data.step : prev.currentStep,
        totalSteps: typeof data.totalSteps === "number" ? data.totalSteps : prev.totalSteps,
        streamText: prev.streamText,
        narrationText: narration || prev.narrationText,
        deliveryFiles,
        resumable: silent ? false : data.resumable === true || prev.resumable,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };
    }

    case "classify": {
      return {
        ...prev,
        model: (data.model as string) ?? prev.model,
        timeline: [...prev.timeline, event],
      };
    }

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
      const tools = [...prev.tools];
      for (let i = tools.length - 1; i >= 0; i--) {
        const t = tools[i];
        if (t.name === toolName && t.ok === undefined) {
          tools[i] = {
            ...t,
            ok: data.ok as boolean,
            error: data.error as string,
          };
          break;
        }
      }
      return {
        ...prev,
        tools,
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

    case "preview_sync":
      return {
        ...prev,
        previewSyncTick: (prev.previewSyncTick ?? 0) + 1,
        timeline: [...prev.timeline, event],
      };

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

    case "gate_decision": {
      const awaiting = data.awaiting === true;
      return {
        ...prev,
        awaiting: awaiting || prev.awaiting,
        awaitingKind: awaiting ? "clarify" : prev.awaitingKind,
        timeline: [...prev.timeline, event],
      };
    }

    case "done": {
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
      const conversational = data.conversational === true;
      return {
        ...prev,
        summary,
        finished: true,
        lastFinishOk: true,
        awaiting: conversational ? false : !!(data.awaiting || data.qualified) || planAwaiting,
        awaitingKind: conversational
          ? null
          : data.qualified || data.awaiting
            ? "clarify"
            : planAwaiting
              ? "plan_approval"
              : null,
        resumable: false,
        error: null,
        streamText,
        pendingPlan: conversational ? null : pendingPlan,
        planSummary: conversational ? null : (pendingPlan?.summary ?? prev.planSummary),
        conversational,
        statusHint: planAwaiting ? "Plano aguardando aprovação…" : prev.statusHint,
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
        resumable: data.recoverable === true || prev.resumable,
        timeline: [...prev.timeline, event],
      };

    case "finish": {
      const failed = data.ok === false;
      const canceled = !!data.canceled || prev.canceled;
      const awaiting = !!(data.awaiting || data.qualified || prev.awaiting);
      const planPending =
        prev.awaitingKind === "plan_approval" && (prev.pendingPlan?.steps?.length ?? 0) > 0;
      return {
        ...prev,
        finished: true,
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
        resumable: failed && data.resumable === true && !canceled,
        error: failed || canceled ? ((data.error as string) ?? prev.error) : null,
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

    default:
      return { ...prev, timeline: [...prev.timeline, event] };
  }
}
