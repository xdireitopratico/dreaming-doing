// agent-fsm.ts — Máquina de estados do agente.
// Define estados, transições, e valida se uma transição é permitida.
// Persiste a cada transição no DB via callback.

export type AgentStateName =
  | "idle"
  | "running"
  | "planning"
  | "awaiting_plan"
  | "building"
  | "observing"
  | "fixing"
  | "delivering"
  | "done"
  | "failed";

export interface AgentStateData {
  name: AgentStateName;
  since: number;
  attempt?: number;
  stepIndex?: number;
  maxSteps?: number;
  classification?: unknown;
  plan?: unknown;
  errors?: string[];
  artifact?: unknown;
  reason?: string;
  recoverable?: boolean;
}

export type AgentEventType =
  | "send"
  /** @deprecated Legado do orchestrator classify — loop ainda emite; mapeia para planning. */
  | "classified"
  | "plan_proposed"
  | "no_plan_needed"
  | "plan_approved"
  | "plan_rejected"
  | "step_done"
  | "all_steps_done"
  | "build_passed"
  | "build_failed"
  | "fixed"
  | "delivered"
  | "error"
  | "cancel";

export interface AgentEvent {
  type: AgentEventType;
  data?: unknown;
  timestamp?: number;
}

export interface TransitionResult {
  ok: boolean;
  from: AgentStateName;
  to: AgentStateName;
  state: AgentStateData;
  error?: string;
}

const MAX_FIX_RETRIES = 3;
const AWAITING_PLAN_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h

function mkState(name: AgentStateName, overrides: Partial<AgentStateData> = {}): AgentStateData {
  return {
    name,
    since: Date.now(),
    attempt: 0,
    stepIndex: 0,
    ...overrides,
  };
}

export const transitions: Record<
  AgentStateName,
  (state: AgentStateData, event: AgentEvent) => AgentStateData
> = {
  idle: (s, e) => {
    if (e.type === "send") return mkState("running");
    return s;
  },

  running: (s, e) => {
    if (e.type === "classified") {
      return mkState("planning", {
        classification: e.data,
        attempt: 0,
      });
    }
    if (e.type === "no_plan_needed") {
      return mkState("building", {
        plan: null,
        stepIndex: 0,
        maxSteps: 20,
        classification: s.classification,
      });
    }
    if (e.type === "plan_proposed") {
      return mkState("awaiting_plan", {
        plan: e.data,
        classification: s.classification,
      });
    }
    if (e.type === "error") {
      return mkState("failed", {
        reason: String(e.data ?? "run error"),
        recoverable: true,
      });
    }
    if (e.type === "cancel") return mkState("failed", { reason: "canceled" });
    return s;
  },

  planning: (s, e) => {
    if (e.type === "plan_proposed") {
      return mkState("awaiting_plan", {
        plan: e.data,
        classification: s.classification,
      });
    }
    if (e.type === "no_plan_needed") {
      return mkState("building", {
        plan: null,
        stepIndex: 0,
        maxSteps: 20,
        classification: s.classification,
      });
    }
    if (e.type === "classified") {
      return {
        ...s,
        classification: e.data,
      };
    }
    if (e.type === "error") {
      return mkState("failed", {
        reason: String(e.data ?? "planning error"),
        recoverable: true,
      });
    }
    return s;
  },

  awaiting_plan: (s, e) => {
    if (e.type === "plan_approved") {
      return mkState("building", {
        plan: e.data ?? s.plan,
        stepIndex: 0,
        maxSteps: 20,
        classification: s.classification,
      });
    }
    if (e.type === "plan_rejected") {
      return mkState("planning", {
        classification: s.classification,
        attempt: 0,
      });
    }
    if (Date.now() - s.since > AWAITING_PLAN_TIMEOUT_MS) {
      return mkState("failed", {
        reason: "Plan approval timed out (24h)",
        recoverable: false,
      });
    }
    return s;
  },

  building: (s, e) => {
    if (e.type === "step_done") {
      return {
        ...s,
        stepIndex: (s.stepIndex ?? 0) + 1,
      };
    }
    if (e.type === "all_steps_done") {
      return mkState("observing", {
        plan: s.plan,
        stepIndex: s.stepIndex,
        maxSteps: s.maxSteps,
      });
    }
    if (e.type === "error") {
      return mkState("fixing", {
        errors: [String(e.data ?? "build error")],
        attempt: 0,
        plan: s.plan,
        stepIndex: s.stepIndex,
        maxSteps: s.maxSteps,
      });
    }
    if (e.type === "cancel") return mkState("failed", { reason: "canceled" });
    return s;
  },

  observing: (s, e) => {
    if (e.type === "build_passed") {
      return mkState("delivering", { artifact: e.data, plan: s.plan });
    }
    if (e.type === "build_failed") {
      return mkState("fixing", {
        errors: Array.isArray(e.data) ? (e.data as string[]) : [String(e.data ?? "build failed")],
        attempt: 0,
        plan: s.plan,
        stepIndex: s.stepIndex,
        maxSteps: s.maxSteps,
      });
    }
    return s;
  },

  fixing: (s, e) => {
    if (e.type === "fixed") {
      return mkState("building", {
        plan: s.plan,
        stepIndex: s.stepIndex,
        maxSteps: s.maxSteps,
      });
    }
    if (e.type === "error") {
      const attempt = (s.attempt ?? 0) + 1;
      if (attempt >= MAX_FIX_RETRIES) {
        return mkState("failed", {
          reason: `Max fix retries (${MAX_FIX_RETRIES}) exceeded: ${String(e.data ?? "unknown")}`,
          recoverable: true,
        });
      }
      return {
        ...s,
        attempt,
        errors: [...(s.errors ?? []), String(e.data ?? "error")],
      };
    }
    if (e.type === "build_failed") {
      const attempt = (s.attempt ?? 0) + 1;
      if (attempt >= MAX_FIX_RETRIES) {
        return mkState("failed", {
          reason: `Max fix retries (${MAX_FIX_RETRIES}) exceeded`,
          recoverable: true,
        });
      }
      return {
        ...s,
        attempt,
        errors: Array.isArray(e.data) ? (e.data as string[]) : [String(e.data ?? "build error")],
      };
    }
    return s;
  },

  delivering: (s, e) => {
    if (e.type === "delivered") {
      return mkState("done", { artifact: s.artifact, plan: s.plan });
    }
    if (e.type === "error") {
      return mkState("failed", {
        reason: String(e.data ?? "delivery error"),
        recoverable: false,
      });
    }
    return s;
  },

  done: () => mkState("done"),
  failed: () => mkState("failed"),
};

/** Valida e aplica uma transição. Retorna o novo estado ou erro. */
export function applyTransition(state: AgentStateData, event: AgentEvent): TransitionResult {
  const handler = transitions[state.name];
  if (!handler) {
    return {
      ok: false,
      from: state.name,
      to: state.name,
      state,
      error: `Unknown state: ${state.name}`,
    };
  }

  const next = handler(state, event);

  // Se o estado não mudou, a transição foi ignorada (evento inválido para este estado)
  if (next === state) {
    return {
      ok: false,
      from: state.name,
      to: state.name,
      state,
      error: `Event "${event.type}" not allowed in state "${state.name}"`,
    };
  }

  return {
    ok: true,
    from: state.name,
    to: next.name,
    state: next,
  };
}

/** Estados terminais — o run acabou (bem ou mal). */
export function isTerminal(state: AgentStateData): boolean {
  return state.name === "done" || state.name === "failed";
}

/** Estados onde o agente está esperando input do usuário. */
export function isAwaitingUser(state: AgentStateData): boolean {
  return state.name === "awaiting_plan";
}