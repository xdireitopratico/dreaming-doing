// runtime/operation-pause-gate.ts — Gate único: cooperative pausa | HOTL terminal+report
import {
  shouldPauseForReason,
  type OperationReportKind,
  type RunOperationMeta,
} from "../../_shared/agent-contract-operation.ts";
import type { PauseReason } from "./infra.ts";
import { appendHotlReport } from "./operation-report.ts";

export function reportKindForPauseReason(reason: PauseReason): OperationReportKind {
  return reason === "operation_wall" ? "timeout" : "error";
}

/** cooperative → pausa (Continuar); HOTL → terminal com report no chat. */
export function shouldCooperativePause(meta: RunOperationMeta, reason: PauseReason): boolean {
  if (reason === "operation_wall") return meta.mode === "cooperative";
  return shouldPauseForReason(meta.mode, reason);
}

export function buildHotlTerminalText(
  message: string,
  meta: RunOperationMeta,
  ctx: {
    kind: OperationReportKind;
    steps?: number;
    touchedPaths?: string[];
  },
): string {
  return appendHotlReport(message, meta, {
    kind: ctx.kind,
    summary: message,
    steps: ctx.steps,
    touchedPaths: ctx.touchedPaths,
  });
}