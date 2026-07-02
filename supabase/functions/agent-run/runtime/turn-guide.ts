// runtime/turn-guide.ts — Gates duros + nudges suaves (Turn Synchronizer PR-A)
import { assertDesignReadsDone } from "./phases/execute-helpers.ts";
import type { ToolCall } from "../types.ts";

export const READ_ONLY_STALL_THRESHOLD = 3;
export const READ_GATE_RELAX_AFTER = 2;
export const ZERO_WRITES_MIN_STEP = 6;

export const ZERO_WRITES_RESUME_MESSAGE =
  "Ainda não materializei arquivos — use Continuar para forçar implementação.";

const STALL_NUDGE_MESSAGE =
  "Várias leituras seguidas sem escrita — implemente com fs_write ou fs_edit no próximo turno.";

export type TurnGuideDecision =
  | { action: "proceed" }
  | { action: "block_read_gate"; message: string; missing: string[] }
  | { action: "read_gate_relaxed"; missing: string[] }
  | { action: "nudge_stall"; message: string }
  | { action: "pause_zero_writes"; message: string };

export function evaluateTurnGuidePreTurn(input: {
  consecutiveReadOnlyBatches: number;
  touchedPathsCount: number;
}): TurnGuideDecision {
  if (
    input.touchedPathsCount === 0 &&
    input.consecutiveReadOnlyBatches >= READ_ONLY_STALL_THRESHOLD
  ) {
    return { action: "nudge_stall", message: STALL_NUDGE_MESSAGE };
  }
  return { action: "proceed" };
}

export function evaluateReadGate(input: {
  readPaths?: string[];
  readsDone: Set<string>;
  patchCalls: ToolCall[];
  readGateBlockCount: number;
}): TurnGuideDecision {
  const gate = assertDesignReadsDone({
    readPaths: input.readPaths,
    readsDone: input.readsDone,
    patchCalls: input.patchCalls,
  });
  if (gate.ok) return { action: "proceed" };

  const nextBlockCount = input.readGateBlockCount + 1;
  if (nextBlockCount >= READ_GATE_RELAX_AFTER) {
    return { action: "read_gate_relaxed", missing: gate.missing };
  }
  return {
    action: "block_read_gate",
    message: gate.message,
    missing: gate.missing,
  };
}

export function shouldPauseZeroDelivery(input: {
  actionableIntent: boolean;
  touchedPathsCount: number;
}): boolean {
  return input.actionableIntent && input.touchedPathsCount === 0;
}

export function evaluateZeroWritesExit(input: {
  approvedPlanBuild: boolean;
  touchedPathsCount: number;
  loopStep: number;
}): TurnGuideDecision {
  if (
    input.approvedPlanBuild &&
    input.touchedPathsCount === 0 &&
    input.loopStep >= ZERO_WRITES_MIN_STEP
  ) {
    return { action: "pause_zero_writes", message: ZERO_WRITES_RESUME_MESSAGE };
  }
  return { action: "proceed" };
}