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

export type AwaitingKind = "qualify" | "plan_approval" | null;

export interface PendingPlan {
  planId: string;
  summary: string;
  rationale?: string;
  markdown?: string;
  mission?: string;
  objective?: string;
  steps: PlanStep[];
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
  tools: Array<{ name: string; args: Record<string, unknown>; ok?: boolean; error?: string }>;
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
  lastFinishOk: null,
  autoResuming: false,
  pendingQueueCount: 0,
  diffs: [],
  pendingPlan: null,
  awaitingKind: null,
  canceled: false,
  awaiting: false,
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

/** Reducer puro dos eventos do agente (exportado para testes). */
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
      const append = data.append === true || data.delta === true;
      return {
        ...prev,
        streamText: append ? `${prev.streamText ?? ""}${chunk}` : chunk,
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

    case "explore": {
      const msg = (data.message as string) ?? prev.message;
      return {
        ...prev,
        phase: "gather",
        message: msg ?? prev.message,
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
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
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
        diffs: [...prev.diffs, { id, path, before, after, op, timestamp: Date.now() }],
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
          ...((data.checks as Array<{ name: string; ok: boolean }>) ?? [{ name: "build", ok: true }]),
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
          ...((data.checks as Array<{ name: string; ok: boolean }>) ?? [{ name: "build", ok: false }]),
        ],
        timeline: [...prev.timeline, event],
      };
    }

    case "done":
      return {
        ...prev,
        summary: (data.summary as string) ?? prev.summary,
        finished: true,
        awaiting: !!(data.awaiting || data.qualified) || (data.planProposed === true && !!prev.pendingPlan),
        awaitingKind: data.qualified || data.awaiting
          ? "qualify"
          : data.planProposed === true && prev.pendingPlan
            ? "plan_approval"
            : null,
        resumable: false,
        error: null,
        streamText: prev.streamText,
        pendingPlan: data.planRejected === true ? null : prev.pendingPlan,
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
        rationale:
          typeof data.rationale === "string" && data.rationale.trim()
            ? data.rationale.trim()
            : undefined,
        markdown:
          typeof data.markdown === "string" && data.markdown.trim()
            ? data.markdown.trim()
            : undefined,
        mission: typeof data.mission === "string" ? data.mission : undefined,
        objective: typeof data.objective === "string" ? data.objective : undefined,
        steps,
        ttlMs: typeof data.ttlMs === "number" ? data.ttlMs : 5 * 60 * 1000,
        proposedAt: Date.now(),
        runId,
        projectId,
      };
      return {
        ...prev,
        awaiting: true,
        awaitingKind: "plan_approval",
        pendingPlan,
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
      return {
        ...prev,
        finished: true,
        canceled,
        awaiting: !!(data.awaiting || prev.awaiting),
        streamText: prev.streamText,
        autoResuming: false,
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

    default:
      return { ...prev, timeline: [...prev.timeline, event] };
  }
}