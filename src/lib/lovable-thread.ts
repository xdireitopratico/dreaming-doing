import type { AgentProgress } from "@/lib/agent-progress";
import {
  buildChatThread,
  PENDING_RUN_ID,
  resolveAssistantProgress,
  type BuildChatThreadOptions,
  type ChatThreadItem,
} from "@/lib/chat-thread";

export { PENDING_RUN_ID, resolveAssistantProgress };

export type FrozenRunSnapshot = Pick<
  AgentProgress,
  | "timeline"
  | "tools"
  | "diffs"
  | "pendingPlan"
  | "streamText"
  | "narrationText"
  | "latencyThoughtMs"
  | "phase"
  | "message"
  | "summary"
  | "error"
  | "finished"
  | "resumable"
  | "lastFinishOk"
  | "currentStep"
  | "totalSteps"
  | "deliveryFiles"
  | "buildLogLines"
  | "stackForkSuggested"
  | "awaiting"
  | "awaitingKind"
  | "conversational"
>;

export type LovableThreadItem = ChatThreadItem;

export type BuildLovableThreadOptions = BuildChatThreadOptions & {
  /** @deprecated PR1: frozenRuns não alimentam mais o render do chat — histórico via DB. */
  frozenRuns?: ReadonlyMap<string, FrozenRunSnapshot>;
};

export function freezeSnapshot(progress: AgentProgress): FrozenRunSnapshot {
  return {
    timeline: progress.timeline,
    tools: progress.tools,
    diffs: progress.diffs,
    pendingPlan: progress.pendingPlan,
    streamText: progress.streamText,
    narrationText: progress.narrationText,
    latencyThoughtMs: progress.latencyThoughtMs,
    phase: progress.phase,
    message: progress.message,
    summary: progress.summary,
    error: progress.error,
    finished: progress.finished,
    resumable: progress.resumable,
    lastFinishOk: progress.lastFinishOk,
    currentStep: progress.currentStep,
    totalSteps: progress.totalSteps,
    deliveryFiles: progress.deliveryFiles,
    buildLogLines: progress.buildLogLines,
    stackForkSuggested: progress.stackForkSuggested,
    awaiting: progress.awaiting,
    awaitingKind: progress.awaitingKind,
    conversational: progress.conversational,
  };
}

/** @deprecated Use buildChatThread — frozenRuns ignorado no render. */
export function buildLovableThread(
  messages: Parameters<typeof buildChatThread>[0],
  progress: Parameters<typeof buildChatThread>[1],
  opts: BuildLovableThreadOptions = {},
): LovableThreadItem[] {
  const { frozenRuns: _frozen, ...rest } = opts;
  return buildChatThread(messages, progress, rest);
}