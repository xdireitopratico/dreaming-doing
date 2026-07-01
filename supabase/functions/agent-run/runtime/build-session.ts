import { logger } from "../../../../supabase/functions/_shared/logger.ts";

export type CanonicalBuildPhase =
  | "planning"
  | "plan_approved"
  | "sandbox_bootstrapping"
  | "preflight_running"
  | "preflight_failed"
  | "build_running"
  | "validate_running"
  | "terminal_ok"
  | "terminal_failed";

export type BuildSessionErrorKind =
  | "environment"
  | "build"
  | "contract"
  | "recoverable"
  | "canceled";

export type BuildSessionCheck = {
  scope: "preflight" | "validate";
  name: string;
  ok: boolean;
  output: string;
};

export type BuildSessionTransition = {
  phase: CanonicalBuildPhase;
  at: string;
  reason?: string;
  recoverable?: boolean;
};

export type CanonicalBuildSession = {
  schemaVersion: 1;
  runId: string | null;
  phase: CanonicalBuildPhase;
  activeRunId: string | null;
  retries: number;
  rootError: {
    kind: BuildSessionErrorKind;
    message: string;
    recoverable: boolean;
    at: string;
  } | null;
  checks: BuildSessionCheck[];
  logs: string[];
  transitions: BuildSessionTransition[];
  terminal: {
    status: "ok" | "failed";
    summary: string;
    at: string;
  } | null;
};

type TransitionOptions = {
  reason?: string;
  recoverable?: boolean;
  retryDelta?: number;
};

type ErrorOptions = {
  kind: BuildSessionErrorKind;
  message: string;
  recoverable: boolean;
  phase?: CanonicalBuildPhase;
  reason?: string;
  retryDelta?: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function logTransition(
  runId: string | null,
  from: CanonicalBuildPhase,
  to: CanonicalBuildPhase,
  options: TransitionOptions = {},
): void {
  logger.event("agent.build_session_transition", {
    runId: runId ?? undefined,
    from,
    to,
    reason: options.reason,
    recoverable: options.recoverable === true,
    retryDelta: options.retryDelta ?? 0,
  });
}

export function createCanonicalBuildSession(
  runId: string | null,
  approvedPlanBuild: boolean,
): CanonicalBuildSession {
  const phase: CanonicalBuildPhase = approvedPlanBuild ? "plan_approved" : "planning";
  logger.event("agent.build_session_created", {
    runId: runId ?? undefined,
    phase,
    approvedPlanBuild,
  });
  return {
    schemaVersion: 1,
    runId,
    phase,
    activeRunId: runId,
    retries: 0,
    rootError: null,
    checks: [],
    logs: [],
    transitions: [{ phase, at: nowIso() }],
    terminal: null,
  };
}

export function transitionBuildSession(
  session: CanonicalBuildSession,
  phase: CanonicalBuildPhase,
  options: TransitionOptions = {},
): CanonicalBuildSession {
  if (session.phase === phase && !options.reason && !options.recoverable && !options.retryDelta) {
    return session;
  }
  logTransition(session.runId, session.phase, phase, options);
  return {
    ...session,
    phase,
    retries: session.retries + (options.retryDelta ?? 0),
    transitions: [
      ...session.transitions,
      {
        phase,
        at: nowIso(),
        reason: options.reason,
        recoverable: options.recoverable,
      },
    ],
  };
}

export function recordBuildSessionChecks(
  session: CanonicalBuildSession,
  scope: BuildSessionCheck["scope"],
  checks: Array<{ name: string; ok: boolean; output: string }>,
): CanonicalBuildSession {
  logger.event("agent.build_session_checks", {
    runId: session.runId ?? undefined,
    scope,
    okCount: checks.filter((check) => check.ok).length,
    failCount: checks.filter((check) => !check.ok).length,
  });
  return {
    ...session,
    checks: [
      ...session.checks.filter((entry) => entry.scope !== scope),
      ...checks.map((check) => ({ scope, ...check })),
    ],
  };
}

export function appendBuildSessionLogs(
  session: CanonicalBuildSession,
  logs: string[],
): CanonicalBuildSession {
  const nextLogs = logs
    .map((log) => log.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (nextLogs.length === 0) return session;
  return {
    ...session,
    logs: [...session.logs, ...nextLogs].slice(-80),
  };
}

export function recordBuildSessionError(
  session: CanonicalBuildSession,
  options: ErrorOptions,
): CanonicalBuildSession {
  logger.event("agent.build_session_error", {
    runId: session.runId ?? undefined,
    phase: options.phase ?? (options.recoverable ? "preflight_failed" : "terminal_failed"),
    kind: options.kind,
    recoverable: options.recoverable,
    message: options.message,
  });
  const nextPhase = options.phase ?? (options.recoverable ? "preflight_failed" : "terminal_failed");
  const transitioned = transitionBuildSession(session, nextPhase, {
    reason: options.reason ?? options.message,
    recoverable: options.recoverable,
    retryDelta: options.retryDelta,
  });
  return {
    ...transitioned,
    rootError: {
      kind: options.kind,
      message: options.message,
      recoverable: options.recoverable,
      at: nowIso(),
    },
  };
}

export function finalizeBuildSession(
  session: CanonicalBuildSession,
  status: "ok" | "failed",
  summary: string,
): CanonicalBuildSession {
  const phase: CanonicalBuildPhase = status === "ok" ? "terminal_ok" : "terminal_failed";
  logger.event("agent.build_session_terminal", {
    runId: session.runId ?? undefined,
    status,
    phase,
    summary: summary.slice(0, 400),
  });
  const transitioned = transitionBuildSession(session, phase, { reason: summary });
  return {
    ...transitioned,
    activeRunId: null,
    terminal: {
      status,
      summary,
      at: nowIso(),
    },
  };
}
