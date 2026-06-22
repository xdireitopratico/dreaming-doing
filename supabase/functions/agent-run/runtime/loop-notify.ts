// runtime/loop-notify.ts — Inspector progress do loop (Fase 2.2)
import { formatLoopStatus, type LoopUpdateContext } from "../loop-status.ts";
import type { NarrationPhase } from "./phases/narration.ts";

export function notifyLoopStatusFromHost(
  narration: NarrationPhase,
  ctx: LoopUpdateContext,
  originalUserRequest: string,
  touchedPaths: Set<string>,
): void {
  const text = formatLoopStatus({
    ...ctx,
    userRequest: originalUserRequest || undefined,
    touchedPaths: [...touchedPaths],
  });
  if (!text) return;
  narration.emitInspectorNote(text);
}