import type { AgentRunStatus } from "./events.ts";

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

/** Shadow mode: grava agent_jobs sem mudar executor v1. */
export function isAgentRuntimeV2ShadowEnabled(envValue?: string | null): boolean {
  const v = (envValue ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "shadow";
}