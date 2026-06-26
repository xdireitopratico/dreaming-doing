import type { AgentRunStatus } from "./events.ts";

export type { AgentRunStatus } from "./agent-contract-events.ts";

/** Transições válidas de agent_runs.status — única fonte para writers. */
const ALLOWED: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  pending: ["running", "failed", "canceled", "completed"],
  running: ["running", "awaiting_user", "completed", "failed", "canceled"],
  awaiting_user: ["completed", "failed", "canceled"],
  completed: ["awaiting_user"],
  failed: ["running"],
  canceled: [],
};

const TERMINAL = new Set<AgentRunStatus>(["completed", "failed", "canceled"]);

export function canTransitionRunStatus(from: AgentRunStatus, to: AgentRunStatus): boolean {
  if (from === to) return true;
  if (from === "canceled") return false;
  if (TERMINAL.has(from) && !(ALLOWED[from] ?? []).includes(to)) return false;
  if (to === "running" && (from === "awaiting_user" || from === "completed")) return false;
  return (ALLOWED[from] ?? []).includes(to);
}

export function isTerminalRunStatus(status: AgentRunStatus): boolean {
  return TERMINAL.has(status);
}

export function shouldSetFinishedAt(to: AgentRunStatus): boolean {
  return TERMINAL.has(to);
}

const RUN_PATCH_COLUMNS = new Set(["error", "steps", "canceled_at", "heartbeat_at"]);

/** Separa colunas de agent_runs vs merge em meta — único writer de transitionRun. */
export function partitionRunExtras(extras: Record<string, unknown>): {
  columns: Record<string, unknown>;
  metaDelta: Record<string, unknown>;
} {
  const columns: Record<string, unknown> = {};
  const metaDelta: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extras)) {
    if (key === "meta" && value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(metaDelta, value as Record<string, unknown>);
      continue;
    }
    if (RUN_PATCH_COLUMNS.has(key)) {
      columns[key] = value;
      continue;
    }
    if (key === "status" || key === "finished_at") continue;
    metaDelta[key] = value;
  }

  return { columns, metaDelta };
}

export type AgentJobStatus = "queued" | "leased" | "completed" | "failed" | "canceled";

const JOB_ALLOWED: Record<AgentJobStatus, readonly AgentJobStatus[]> = {
  queued: ["leased", "canceled"],
  leased: ["completed", "failed", "queued", "canceled"],
  completed: [],
  failed: [],
  canceled: [],
};

export function canTransitionJobStatus(from: AgentJobStatus, to: AgentJobStatus): boolean {
  if (from === to) return true;
  if (from === "completed" || from === "failed" || from === "canceled") return false;
  return (JOB_ALLOWED[from] ?? []).includes(to);
}

export const AGENT_RUNTIME_V2_SHADOW_ENV = "AGENT_RUNTIME_V2";

export type AgentRuntimeV2Mode = "off" | "shadow" | "worker";

/** off | shadow (observability + fallback) | worker (1 job/chunk, sem fallback). */
export function parseAgentRuntimeV2Mode(envValue?: string | null): AgentRuntimeV2Mode {
  const v = (envValue ?? "").trim().toLowerCase();
  if (v === "worker") return "worker";
  if (v === "1" || v === "true" || v === "shadow") return "shadow";
  return "off";
}

/** Fila agent_jobs ativa (shadow ou worker). */
export function isAgentJobsEnabled(envValue?: string | null): boolean {
  return parseAgentRuntimeV2Mode(envValue) !== "off";
}

/** Shadow/worker legacy alias — grava agent_jobs. */
export function isAgentRuntimeV2ShadowEnabled(envValue?: string | null): boolean {
  return isAgentJobsEnabled(envValue);
}

/** Worker real: executor exige lease; sem upsert fallback. */
export function isAgentRuntimeV2WorkerEnabled(envValue?: string | null): boolean {
  return parseAgentRuntimeV2Mode(envValue) === "worker";
}
