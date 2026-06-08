import type { ChatMessage } from "@/components/editor/ChatInput";
import type { AgentProgress } from "@/lib/agent-progress";
import { progressFromAssistantMessage } from "@/lib/assistant-run-progress";

export type FrozenRunSnapshot = Pick<
  AgentProgress,
  | "timeline"
  | "tools"
  | "diffs"
  | "pendingPlan"
  | "streamText"
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
    currentStep: progress.currentStep,
    totalSteps: progress.totalSteps,
    deliveryFiles: progress.deliveryFiles,
    buildLogLines: progress.buildLogLines,
    stackForkSuggested: progress.stackForkSuggested,
  };
}

function buildRunIdFromUser(msg: ChatMessage): string | null {
  const meta = msg.meta;
  if (!meta || typeof meta !== "object") return null;
  if (typeof meta.buildRunId === "string") return meta.buildRunId;
  return null;
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

/** Ancora run ativa ao turno user (ex.: plan_approved com meta.buildRunId). */
function insertIndexForActiveRun(
  items: LovableThreadItem[],
  activeRunId: string,
): number | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind !== "user") continue;
    if (buildRunIdFromUser(item.message) === activeRunId) {
      return i + 1;
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind === "assistant" && item.runId === activeRunId) {
      return i;
    }
  }

  return null;
}

function assistantRunId(msg: ChatMessage): string | undefined {
  return (
    msg.runId ??
    (typeof msg.meta?.buildRunId === "string" ? msg.meta.buildRunId : undefined) ??
    (typeof msg.meta?.runId === "string" ? msg.meta.runId : undefined)
  );
}

function mergeAssistantIntoItems(
  items: LovableThreadItem[],
  msg: ChatMessage,
  runId?: string,
): LovableThreadItem[] {
  const last = items[items.length - 1];
  if (
    last?.kind === "assistant" &&
    runId &&
    last.runId === runId &&
    !last.isActive &&
    !last.live &&
    !last.frozen
  ) {
    const prev = last.message;
    const mergedContent = [prev?.content, msg.content]
      .filter((c) => c?.trim())
      .join("\n\n") || msg.content;
    const next = [...items];
    next[items.length - 1] = {
      ...last,
      message: {
        ...msg,
        content: mergedContent,
        toolCalls: msg.toolCalls?.length ? msg.toolCalls : prev?.toolCalls,
      },
      runId,
    };
    return next;
  }
  return [
    ...items,
    {
      kind: "assistant" as const,
      message: msg,
      runId,
      isActive: false,
    },
  ];
}

function mergeAssistantMessages(
  a?: ChatMessage,
  b?: ChatMessage,
): ChatMessage | undefined {
  if (!a) return b;
  if (!b) return a;
  const merged =
    [a.content, b.content].filter((c) => c?.trim()).join("\n\n") || b.content;
  return {
    ...b,
    content: merged,
    toolCalls: b.toolCalls?.length ? b.toolCalls : a.toolCalls,
  };
}

/** No máximo 1 bloco assistant por runId — evita FORGE duplicado no chat. */
function dedupeThreadByRunId(items: LovableThreadItem[]): LovableThreadItem[] {
  const out: LovableThreadItem[] = [];
  const slotByRunId = new Map<string, number>();

  for (const item of items) {
    if (item.kind === "user") {
      out.push(item);
      continue;
    }

    const runId = item.runId;
    if (!runId) {
      out.push(item);
      continue;
    }

    const existingIdx = slotByRunId.get(runId);
    if (existingIdx === undefined) {
      slotByRunId.set(runId, out.length);
      out.push(item);
      continue;
    }

    const existing = out[existingIdx] as Extract<LovableThreadItem, { kind: "assistant" }>;
    const preferIncoming = item.live || item.frozen || item.isActive;
    const preferExisting = existing.live || existing.frozen || existing.isActive;

    out[existingIdx] = {
      ...existing,
      ...item,
      message: mergeAssistantMessages(existing.message, item.message),
      live: preferIncoming ? (item.live ?? existing.live) : existing.live,
      frozen: preferIncoming ? (item.frozen ?? existing.frozen) : existing.frozen,
      isActive: existing.isActive || item.isActive,
      runId,
    };

    if (preferIncoming && !preferExisting) {
      out[existingIdx] = {
        ...out[existingIdx],
        live: item.live,
        frozen: item.frozen,
        isActive: item.isActive,
      };
    }
  }

  return out;
}

/** Liga frozen histórico a cada turno assistant — mini-cards acumulam no thread. */
function attachFrozenToHistoricalItems(
  items: LovableThreadItem[],
  frozenRuns?: ReadonlyMap<string, FrozenRunSnapshot>,
): LovableThreadItem[] {
  if (!frozenRuns?.size) return items;
  return items.map((item) => {
    if (item.kind !== "assistant" || item.live || item.isActive || item.frozen) {
      return item;
    }
    const rid = item.runId;
    if (!rid || !frozenRuns.has(rid)) return item;
    return { ...item, frozen: frozenRuns.get(rid) };
  });
}

function insertAssistantSlot(
  items: LovableThreadItem[],
  insertAt: number,
  slot: Extract<LovableThreadItem, { kind: "assistant" }>,
): LovableThreadItem[] {
  const next = [...items];
  const existing = next[insertAt];
  if (existing?.kind === "assistant") {
    if (
      existing.runId === slot.runId ||
      (existing.isActive || existing.frozen) ||
      !existing.message?.content?.trim()
    ) {
      next[insertAt] = {
        ...existing,
        ...slot,
        message: existing.message ?? slot.message,
        runId: slot.runId ?? existing.runId,
      };
      return next;
    }
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

  for (const msg of messages) {
    if (msg.role === "tool") continue;

    if (msg.role === "user") {
      items.push({ kind: "user", message: msg });
      continue;
    }

    if (msg.role === "assistant") {
      items = mergeAssistantIntoItems(items, msg, assistantRunId(msg));
    }
  }

  if (!activeRunId) {
    if (progress.error && progress.finished && !progress.canceled) {
      const insertAt = pendingAssistantInsertIndex(items);
      const existing = items[insertAt];
      if (
        existing?.kind !== "assistant" ||
        !existing.message?.content?.trim()
      ) {
        items = insertAssistantSlot(items, insertAt, {
          kind: "assistant",
          live: progress,
          isActive: false,
        });
      }
    }
    return dedupeThreadByRunId(attachFrozenToHistoricalItems(items, frozenRuns));
  }

  const anchored = insertIndexForActiveRun(items, activeRunId);
  const insertAt = anchored ?? pendingAssistantInsertIndex(items);

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

  return dedupeThreadByRunId(attachFrozenToHistoricalItems(items, frozenRuns));
}

export { freezeSnapshot };

/** Progress efetivo para render: live > frozen > reidratação do DB */
export function resolveAssistantProgress(
  item: Extract<LovableThreadItem, { kind: "assistant" }>,
): AgentProgress | null {
  if (item.live) return item.live;
  if (!item.frozen) {
    return item.message ? progressFromAssistantMessage(item.message) : null;
  }
  const f = item.frozen;
  return {
    phase: f.phase,
    message: f.message,
    currentStep: f.currentStep ?? null,
    totalSteps: f.totalSteps ?? null,
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
    deliveryFiles: f.deliveryFiles,
    buildLogLines: f.buildLogLines,
    stackForkSuggested: f.stackForkSuggested,
  };
}