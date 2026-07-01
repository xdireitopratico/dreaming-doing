// runtime/loop-notify.ts — Inspector progress do loop (Fase 2.2)
import { logger } from "../../_shared/logger.ts";
import { formatLoopStatus, type LoopUpdateContext } from "../loop-status.ts";
import type { NarrationPhase } from "./phases/narration.ts";

export function notifyLoopStatusFromHost(
  narration: NarrationPhase,
  ctx: LoopUpdateContext,
  originalUserRequest: string,
  touchedPaths: Set<string>,
): void {
  logger.event("agent.loop_status", {
    kind: ctx.kind,
    step: ctx.step,
    total: ctx.total,
    allOk: ctx.allOk,
    errorDetail: ctx.errorDetail,
    fixResume: ctx.fixResume,
    resumeStep: ctx.resumeStep,
  });
  const text = formatLoopStatus({
    ...ctx,
    userRequest: originalUserRequest || undefined,
    touchedPaths: [...touchedPaths],
  });
  if (!text) return;
  narration.emitInspectorNote(text);
}
