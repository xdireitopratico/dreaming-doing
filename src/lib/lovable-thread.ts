import type { ChatMessage } from "@/components/editor/ChatInput";
import type { AgentProgress } from "@/lib/agent-progress";

export type FrozenRunSnapshot = Pick<
  AgentProgress,
  "timeline" | "tools" | "diffs" | "pendingPlan" | "streamText" | "phase" | "message" | "summary"
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
  };
}

/**
 * Thread sequencial estilo Lovable: user → assistant, em ordem cronológica.
 */
export function buildLovableThread(
  messages: ChatMessage[],
  progress: AgentProgress,
  opts: BuildLovableThreadOptions = {},
): LovableThreadItem[] {
  const { activeRunId, running = false, frozenRuns } = opts;
  const items: LovableThreadItem[] = [];

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

  if (running && activeRunId) {
    items.push({
      kind: "assistant",
      live: progress,
      runId: activeRunId,
      isActive: true,
    });
  } else if (!running && activeRunId && frozenRuns?.has(activeRunId)) {
    const frozen = frozenRuns.get(activeRunId)!;
    const last = items[items.length - 1];
    if (last?.kind === "user") {
      items.push({
        kind: "assistant",
        frozen,
        runId: activeRunId,
        isActive: false,
      });
    } else if (last?.kind === "assistant" && !last.message?.content?.trim()) {
      items[items.length - 1] = {
        ...last,
        frozen,
        runId: activeRunId,
        isActive: false,
      };
    }
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
    error: null,
    finished: true,
    resumable: false,
    statusHint: null,
    streamText: f.streamText,
    lastFinishOk: true,
    autoResuming: false,
    pendingQueueCount: 0,
    diffs: f.diffs,
    pendingPlan: f.pendingPlan,
  };
}