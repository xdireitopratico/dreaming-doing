import type { ChatMessage } from "@/components/editor/ChatInput";
import type { AgentProgress } from "@/lib/agent-progress";

export type FrozenRunSnapshot = Pick<
  AgentProgress,
  "timeline" | "tools" | "diffs" | "pendingPlan" | "streamText" | "phase" | "message" | "summary" | "error" | "finished" | "resumable" | "lastFinishOk"
>;

export type LovableThreadItem =
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant";
      message?: ChatMessage;
      live?: AgentProgress;
      frozen?: FrozenRunSnapshot;
      runId?: string;
      isActive: boolean;
    };

export type BuildLovableThreadOptions = {
  activeRunId?: string | null;
  running?: boolean;
  frozenRuns?: ReadonlyMap<string, FrozenRunSnapshot>;
};

function freezeSnapshot(progress: AgentProgress): FrozenRunSnapshot {
  return {
    timeline: progress.timeline,
    tools: progress.tools,
    diffs: progress.diffs,
    pendingPlan: progress.pendingPlan,
    streamText: progress.streamText,
    phase: progress.phase,
    message: progress.message,
    summary: progress.summary,
    error: progress.error,
    finished: progress.finished,
    resumable: progress.resumable,
    lastFinishOk: progress.lastFinishOk,
  };
}

/** Índice onde inserir assistant live/frozen: após último user sem resposta no DB. */
function pendingAssistantInsertIndex(items: LovableThreadItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind !== "user") continue;
    const next = items[i + 1];
    const hasReply =
      next?.kind === "assistant" && !!next.message?.content?.trim();
    if (!hasReply) return i + 1;
  }
  return items.length;
}

function insertAssistantSlot(
  items: LovableThreadItem[],
  insertAt: number,
  slot: Extract<LovableThreadItem, { kind: "assistant" }>,
): LovableThreadItem[] {
  const next = [...items];
  const existing = next[insertAt];
  if (
    existing?.kind === "assistant" &&
    (existing.isActive || existing.frozen) &&
    !existing.message?.content?.trim()
  ) {
    next[insertAt] = { ...existing, ...slot, message: existing.message ?? slot.message };
    return next;
  }
  next.splice(insertAt, 0, slot);
  return next;
}

/**
 * Thread sequencial estilo Lovable: user → assistant, live/frozen no turno pendente.
 */
export function buildLovableThread(
  messages: ChatMessage[],
  progress: AgentProgress,
  opts: BuildLovableThreadOptions = {},
): LovableThreadItem[] {
  const { activeRunId, running = false, frozenRuns } = opts;
  let items: LovableThreadItem[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.role === "tool") continue;

    if (msg.role === "user") {
      items.push({ kind: "user", message: msg });
      const next = messages[i + 1];
      if (next?.role === "assistant") {
        items.push({
          kind: "assistant",
          message: next,
          runId: next.runId,
          isActive: false,
        });
        i++;
      }
      continue;
    }

    if (msg.role === "assistant") {
      items.push({
        kind: "assistant",
        message: msg,
        runId: msg.runId,
        isActive: false,
      });
    }
  }

  if (!activeRunId) return items;

  const insertAt = pendingAssistantInsertIndex(items);

  if (running) {
    items = insertAssistantSlot(items, insertAt, {
      kind: "assistant",
      live: progress,
      runId: activeRunId,
      isActive: true,
    });
  } else if (frozenRuns?.has(activeRunId)) {
    items = insertAssistantSlot(items, insertAt, {
      kind: "assistant",
      frozen: frozenRuns.get(activeRunId),
      runId: activeRunId,
      isActive: false,
    });
  }

  return items;
}

export { freezeSnapshot };

/** Progress efetivo para render: live > frozen > null */
export function resolveAssistantProgress(
  item: Extract<LovableThreadItem, { kind: "assistant" }>,
): AgentProgress | null {
  if (item.live) return item.live;
  if (!item.frozen) return null;
  const f = item.frozen;
  return {
    phase: f.phase,
    message: f.message,
    currentStep: null,
    totalSteps: null,
    tools: f.tools,
    cost: 0,
    model: null,
    skills: [],
    runtimeChecks: [],
    timeline: f.timeline,
    summary: f.summary,
    error: f.error,
    finished: f.finished ?? true,
    resumable: f.resumable ?? false,
    statusHint: null,
    streamText: f.streamText,
    lastFinishOk: f.lastFinishOk ?? true,
    autoResuming: false,
    pendingQueueCount: 0,
    diffs: f.diffs,
    pendingPlan: f.pendingPlan,
  };
}