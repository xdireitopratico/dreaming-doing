// runtime/infra.ts — Heartbeat, platform deadline e pausa honesta (execution sanity)
import type { ChatMessage, LoopPhase } from "../types.ts";
import type { CanonicalBuildSession } from "./build-session.ts";
import { transitionRun } from "../../_shared/run-lifecycle.ts";
import { platformDeadlineExceeded } from "./platform-deadline.ts";

export const MAX_LLM_RETRIES = 3;
export const SILENCE_HEARTBEAT_MS = 90_000;

export type PauseReason = "llm_exhausted" | "platform_limit" | "step_limit" | "llm_error";

export type OperationPauseResult = {
  ok: false;
  error: string;
  steps: number;
  resumable: false;
  awaiting: true;
  awaitingUser: { type: PauseReason; message: string };
  toolsUsed: string[];
};

export type RunInfraDeps = {
  sb: any;
  runId: string | null;
  invocationStartedAt: number;
  getLastActivityAt: () => number;
  setLastActivityAt: (ms: number) => void;
  getMaxStepsLimit: () => number;
  touchedPaths: Set<string>;
  getMessages: () => ChatMessage[];
  originalUserRequest: string;
  narrationTrim: () => string;
  narrationBuffer: string;
  emit: (type: string, data: unknown) => void;
  getPhase: () => LoopPhase;
  saveCheckpoint: (phase: LoopPhase, force?: boolean) => Promise<void>;
  getBuildSession: () => CanonicalBuildSession | null;
  persistFinal?: (summary: string, opts?: { lastFinishOk?: boolean; finished?: boolean }) => Promise<void>;
};

export function platformLimitExceeded(
  deps: Pick<RunInfraDeps, "invocationStartedAt">,
): boolean {
  return platformDeadlineExceeded(deps.invocationStartedAt);
}

export async function touchHeartbeat(deps: RunInfraDeps): Promise<void> {
  if (!deps.runId) return;
  try {
    await deps.sb
      .from("agent_runs")
      .update({ heartbeat_at: new Date().toISOString() })
      .eq("id", deps.runId);
  } catch {
    /* best-effort */
  }
  deps.setLastActivityAt(Date.now());
}

export async function bumpLlmRetries(
  deps: Pick<RunInfraDeps, "sb" | "runId">,
): Promise<number> {
  if (!deps.runId) return MAX_LLM_RETRIES;
  try {
    const { data: row } = await deps.sb
      .from("agent_runs")
      .select("meta")
      .eq("id", deps.runId)
      .maybeSingle();
    const meta = (row?.meta ?? {}) as Record<string, unknown>;
    const next = (typeof meta.llmRetries === "number" ? meta.llmRetries : 0) + 1;
    await deps.sb
      .from("agent_runs")
      .update({ meta: { ...meta, llmRetries: next } })
      .eq("id", deps.runId);
    return next;
  } catch {
    return MAX_LLM_RETRIES;
  }
}

export async function resetLlmRetries(
  deps: Pick<RunInfraDeps, "sb" | "runId">,
): Promise<void> {
  if (!deps.runId) return;
  try {
    const { data: row } = await deps.sb
      .from("agent_runs")
      .select("meta")
      .eq("id", deps.runId)
      .maybeSingle();
    const meta = (row?.meta ?? {}) as Record<string, unknown>;
    if (typeof meta.llmRetries !== "number" || meta.llmRetries === 0) return;
    await deps.sb
      .from("agent_runs")
      .update({ meta: { ...meta, llmRetries: 0 } })
      .eq("id", deps.runId);
  } catch {
    /* best-effort */
  }
}

export function maybeEmitSilenceHeartbeat(deps: RunInfraDeps): void {
  const lastActivityAt = deps.getLastActivityAt();
  if (Date.now() - lastActivityAt < SILENCE_HEARTBEAT_MS) return;
  deps.emit("heartbeat", {
    message: "Ainda processando o modelo…",
    silentMs: Date.now() - lastActivityAt,
  });
}

export async function isRunCanceled(sb: any, runId: string | null): Promise<boolean> {
  if (!runId) return false;
  const { data } = await sb
    .from("agent_runs")
    .select("canceled_at")
    .eq("id", runId)
    .maybeSingle();
  return !!data?.canceled_at;
}

/** Pausa honesta: awaiting_user + checkpoint — sem auto-enfileirar Inngest. */
export async function pauseOperationForUser(
  deps: RunInfraDeps,
  input: {
    reason: PauseReason;
    message: string;
    steps: number;
    toolsUsed: Set<string>;
  },
): Promise<OperationPauseResult> {
  await deps.saveCheckpoint(deps.getPhase(), true);
  await touchHeartbeat(deps);

  if (deps.runId) {
    await transitionRun(deps.sb, deps.runId, "awaiting_user", {
      meta: { awaitingUser: { type: input.reason, message: input.message } },
      heartbeat_at: new Date().toISOString(),
    });
  }

  deps.emit("run_paused", {
    reason: input.reason,
    message: input.message,
  });
  deps.emit("assistant_text", { text: input.message, final: true, append: false });

  if (deps.persistFinal) {
    await deps.persistFinal(input.message, { lastFinishOk: false, finished: false });
  }

  deps.emit("finish", { ok: false, awaiting: true, resumable: false });

  return {
    ok: false,
    error: input.message,
    steps: input.steps,
    resumable: false,
    awaiting: true,
    awaitingUser: { type: input.reason, message: input.message },
    toolsUsed: [...input.toolsUsed],
  };
}