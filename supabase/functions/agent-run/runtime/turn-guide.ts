// runtime/turn-guide.ts — Gates duros + nudges suaves (Turn Synchronizer PR-A)
import { assertDesignReadsDone } from "./phases/execute-helpers.ts";
import type { ToolCall } from "../types.ts";

export const READ_ONLY_STALL_THRESHOLD = 3;
export const READ_GATE_RELAX_AFTER = 2;

/** Feedback camada B — loop continua na mesma invocação, sem awaiting_user. */
export const ZERO_DELIVERY_LOOP_BACK_MESSAGE =
  "Leituras concluídas, mas nenhum arquivo foi materializado. " +
  "Implemente agora com fs_write, fs_edit ou shell_exec via tool_calls nativas — " +
  "não responda só em texto nem JSON no content.";

const STALL_NUDGE_MESSAGE =
  "Várias leituras seguidas sem escrita — implemente com fs_write ou fs_edit no próximo turno.";

export type TurnGuideDecision =
  | { action: "proceed" }
  | { action: "block_read_gate"; message: string; missing: string[] }
  | { action: "read_gate_relaxed"; missing: string[] }
  | { action: "nudge_stall"; message: string };

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

/** Build acionável sem entrega — corrigir in-loop (camada B), não pausar com Continuar. */
export function shouldLoopBackForZeroDelivery(input: {
  actionableIntent: boolean;
  touchedPathsCount: number;
}): boolean {
  return input.actionableIntent && input.touchedPathsCount === 0;
}