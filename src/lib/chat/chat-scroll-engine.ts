import type { ThreadItem } from "@/lib/chat/types";
import { scrollOffsetToAlignUserMessage } from "@/lib/chat/user-message-anchor";

export type ChatFollowMode = "manual" | "follow-bottom" | "follow-anchor";

export const CHAT_SCROLL_MAX_STEP_PX = 8;
export const CHAT_SCROLL_PIN_THRESHOLD_PX = 100;
export const CHAT_SCROLL_ANCHOR_DRIFT_PX = 48;

export function clampScrollTop(
  value: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.max(0, Math.min(max, value));
}

export function computeBottomTarget(scrollHeight: number, clientHeight: number): number {
  return clampScrollTop(scrollHeight - clientHeight, scrollHeight, clientHeight);
}

export function computeSmoothScrollStep(
  current: number,
  target: number,
  maxStepPx: number,
): number {
  const delta = target - current;
  if (Math.abs(delta) <= 0.5) return target;
  return current + Math.max(-maxStepPx, Math.min(maxStepPx, delta));
}

export function isNearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

/** Assinatura leve — dispara follow sem depender só de thread.length. */
export function buildThreadScrollSignature(thread: ThreadItem[]): string {
  if (thread.length === 0) return "empty";
  const last = thread[thread.length - 1];
  if (!last) return "empty";
  if (last.kind === "user") {
    return `user:${last.message.id}:${last.message.content.length}`;
  }
  return [
    "assistant",
    last.runId,
    last.isActive ? "live" : "done",
    last.streamText?.length ?? 0,
    last.narration?.length ?? 0,
    last.thinking?.status ?? "none",
    last.thinking?.status === "done" ? last.thinking.durationSec : 0,
    last.miniCard ? 1 : 0,
    last.error?.length ?? 0,
  ].join(":");
}

export function resolveScrollTarget(opts: {
  mode: ChatFollowMode;
  container: HTMLElement;
  anchoredUserId: string | null;
}): number | null {
  const { mode, container, anchoredUserId } = opts;
  const { scrollHeight, clientHeight, scrollTop } = container;

  if (mode === "manual") return null;

  if (mode === "follow-anchor" && anchoredUserId) {
    const bubble = container.querySelector<HTMLElement>(
      `[data-user-msg-id="${anchoredUserId}"]`,
    );
    if (bubble) {
      return scrollOffsetToAlignUserMessage(container, bubble);
    }
  }

  if (mode === "follow-bottom" || mode === "follow-anchor") {
    return computeBottomTarget(scrollHeight, clientHeight);
  }

  return scrollTop;
}

export function shouldShowNewMessagesPill(opts: {
  mode: ChatFollowMode;
  signature: string;
  signatureAtManual: string | null;
}): boolean {
  if (opts.mode !== "manual") return false;
  if (!opts.signatureAtManual) return false;
  return opts.signature !== opts.signatureAtManual;
}