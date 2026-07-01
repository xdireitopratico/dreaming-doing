// runtime/infra.ts — Heartbeat, budget e resumable chunks (Fase 2.2)
import type { LoopPhase } from "../types.ts";
import type { CanonicalBuildSession } from "./build-session.ts";

export const MAX_LLM_RETRIES = 3;
export const SILENCE_HEARTBEAT_MS = 90_000;

export type ResumableChunkResult = {
  ok: false;
  error: string;
  steps: number;
  resumable: true;
  buildFix?: boolean;
  toolsUsed: string[];
};

export type RunInfraDeps = {
  sb: any;
  runId: string | null;
  runStartTime: number;
  loopBudgetMs: number;
  getLastActivityAt: () => number;
  setLastActivityAt: (ms: number) => void;
  getMaxStepsLimit: () => number;
  touchedPaths: Set<string>;
  narrationTrim: () => string;
  narrationBuffer: string;
  emit: (type: string, data: unknown) => void;
  getPhase: () => LoopPhase;
  saveCheckpoint: (phase: LoopPhase, force?: boolean) => Promise<void>;
  persistCheckpointChat: (steps: number, buildFix?: boolean) => Promise<void>;
  getBuildSession: () => CanonicalBuildSession | null;
};

export function loopBudgetExceeded(
  deps: Pick<RunInfraDeps, "runStartTime" | "loopBudgetMs">,
): boolean {
  return Date.now() - deps.runStartTime > deps.loopBudgetMs;
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

export function emitDeliveryCheckpoint(deps: RunInfraDeps, step: number): void {
  const deliveryFiles = [...deps.touchedPaths];
  const narration = deps.narrationTrim();
  deps.emit("delivery_checkpoint", {
    step,
    totalSteps: deps.getMaxStepsLimit(),
    deliveryFiles,
    narration: narration.slice(0, 4000),
    resumable: true,
    silent: true,
    message:
      deliveryFiles.length > 0
        ? `${deliveryFiles.length} arquivo(s) prontos — continuo em seguida`
        : "Continuo em seguida",
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

export async function returnResumableChunk(
  deps: RunInfraDeps,
  steps: number,
  toolsUsed: Set<string>,
  options?: { buildFix?: boolean },
): Promise<ResumableChunkResult> {
  await deps.saveCheckpoint(deps.getPhase(), true);
  emitDeliveryCheckpoint(deps, steps);
  await touchHeartbeat(deps);
  deps.emit("explore", {
    message: deps.narrationBuffer || "",
  });
  await deps.persistCheckpointChat(steps, options?.buildFix);
  return {
    ok: false,
    error: "Retomando automaticamente em novo chunk…",
    steps,
    resumable: true,
    buildFix: options?.buildFix === true,
    toolsUsed: [...toolsUsed],
  };
}
