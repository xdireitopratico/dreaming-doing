import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  hasMaterializedCardSnapshot,
  progressFromAssistantMessage,
  runIdFromAssistantMessage,
} from "@/lib/assistant-run-progress";

/** RunId sintético — slot assistant otimista antes do runId real (Think imediato). */
export const PENDING_RUN_ID = "__pending__";

export type ChatThreadItem =
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant";
      message?: ChatMessage;
      live?: AgentProgress;
      runId?: string;
      isActive: boolean;
    };

export type BuildChatThreadOptions = {
  activeRunId?: string | null;
  running?: boolean;
  pendingTurnStartedAtMs?: number | null;
};

function buildRunIdFromUser(msg: ChatMessage): string | null {
  const meta = msg.meta;
  if (!meta || typeof meta !== "object") return null;
  if (typeof meta.buildRunId === "string") return meta.buildRunId;
  return null;
}

function assistantRunId(msg: ChatMessage): string | undefined {
  return runIdFromAssistantMessage(msg);
}

function lastUserIndex(items: ChatThreadItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.kind === "user") return i;
  }
  return -1;
}

function userHasAssistantReply(items: ChatThreadItem[], userIdx: number): boolean {
  const next = items[userIdx + 1];
  if (next?.kind !== "assistant") return false;
  if (next.live && !next.live.finished) return false;
  if (next.message?.content?.trim()) return true;
  if (next.message && hasMaterializedCardSnapshot(next.message)) return true;
  return false;
}

function insertIndexForActiveRun(items: ChatThreadItem[], activeRunId: string): number | null {
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

function pendingAssistantInsertIndex(items: ChatThreadItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind !== "user") continue;
    const next = items[i + 1];
    if (next?.kind !== "assistant") return i + 1;
    if (!next.message?.content?.trim() && !next.live && !hasMaterializedCardSnapshot(next.message)) {
      return i + 1;
    }
  }
  return items.length;
}

function mergeAssistantMessages(a?: ChatMessage, b?: ChatMessage): ChatMessage | undefined {
  if (!a) return b;
  if (!b) return a;
  const aText = a.content?.trim() ?? "";
  const bText = b.content?.trim() ?? "";
  if (!aText) return b;
  if (!bText || aText === bText || bText.includes(aText) || aText.includes(bText)) {
    return {
      ...b,
      content: bText || aText,
      toolCalls: b.toolCalls?.length ? b.toolCalls : a.toolCalls,
    };
  }
  return {
    ...b,
    content: [aText, bText].join("\n\n"),
    toolCalls: b.toolCalls?.length ? b.toolCalls : a.toolCalls,
  };
}

function mergeAssistantIntoItems(
  items: ChatThreadItem[],
  msg: ChatMessage,
  runId?: string,
): ChatThreadItem[] {
  if (runId) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (
        item?.kind === "assistant" &&
        item.runId === runId &&
        !item.isActive &&
        !item.live
      ) {
        const prev = item.message;
        const mergedContent =
          [prev?.content, msg.content].filter((c) => c?.trim()).join("\n\n") || msg.content;
        const next = [...items];
        next[i] = {
          ...item,
          message: {
            ...msg,
            content: mergedContent,
            toolCalls: msg.toolCalls?.length ? msg.toolCalls : prev?.toolCalls,
          },
          runId,
        };
        return next;
      }
    }
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

function dedupeThreadByRunId(items: ChatThreadItem[]): ChatThreadItem[] {
  const out: ChatThreadItem[] = [];
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

    const existing = out[existingIdx] as Extract<ChatThreadItem, { kind: "assistant" }>;
    const mergedLive = item.live ?? existing.live;
    const terminal = mergedLive?.finished || existing.live?.finished;

    out[existingIdx] = {
      ...existing,
      ...item,
      message: mergeAssistantMessages(existing.message, item.message),
      live: mergedLive,
      isActive: terminal ? false : existing.isActive || item.isActive,
      runId,
    };
  }

  return out;
}

function insertAssistantSlot(
  items: ChatThreadItem[],
  insertAt: number,
  slot: Extract<ChatThreadItem, { kind: "assistant" }>,
): ChatThreadItem[] {
  const next = [...items];

  if (slot.runId) {
    for (let i = 0; i < next.length; i++) {
      const ex = next[i];
      if (
        ex?.kind === "assistant" &&
        ex.runId === PENDING_RUN_ID &&
        slot.runId !== PENDING_RUN_ID
      ) {
        next[i] = {
          ...ex,
          ...slot,
          message: mergeAssistantMessages(ex.message, slot.message),
          runId: slot.runId,
          live: slot.live ?? ex.live,
          isActive: slot.isActive ?? ex.isActive,
        };
        return next;
      }
      if (ex?.kind === "assistant" && ex.runId === slot.runId) {
        next[i] = {
          ...ex,
          ...slot,
          message: mergeAssistantMessages(ex.message, slot.message),
          runId: slot.runId,
          live: slot.live ?? ex.live,
          isActive: ex.isActive || slot.isActive,
        };
        return next;
      }
    }
  }

  const existing = next[insertAt];
  if (existing?.kind === "assistant") {
    const sameRun = !!slot.runId && !!existing.runId && slot.runId === existing.runId;
    if (sameRun) {
      next[insertAt] = {
        ...existing,
        ...slot,
        message: mergeAssistantMessages(existing.message, slot.message),
        runId: slot.runId ?? existing.runId,
        live: slot.live ?? existing.live,
        isActive: slot.isActive ?? existing.isActive,
      };
      return next;
    }
  }

  next.splice(insertAt, 0, slot);
  return next;
}

function shouldAttachEphemeralOverlay(
  items: ChatThreadItem[],
  progress: AgentProgress,
): boolean {
  const userIdx = lastUserIndex(items);
  if (userIdx < 0) return false;
  if (userHasAssistantReply(items, userIdx)) return false;

  const pendingText = progress.streamText?.trim();
  if (progress.error && progress.finished && !progress.canceled) return true;
  if (pendingText && progress.finished && progress.lastFinishOk === true) return true;
  if (
    progress.finished &&
    pendingText &&
    (progress.conversational === true || progress.awaitingKind === "qualify")
  ) {
    return true;
  }
  return false;
}

function shouldAttachLiveOverlay(
  items: ChatThreadItem[],
  activeRunId: string,
  progress: AgentProgress,
  running: boolean,
): boolean {
  if (progress.finished && !running) {
    const anchoredIdx = insertIndexForActiveRun(items, activeRunId);
    if (anchoredIdx !== null) {
      const slot = items[anchoredIdx];
      if (slot?.kind === "assistant" && slot.message && hasMaterializedCardSnapshot(slot.message)) {
        return false;
      }
    }
    const userIdx = lastUserIndex(items);
    if (userIdx >= 0 && userHasAssistantReply(items, userIdx)) {
      const reply = items[userIdx + 1];
      if (
        reply?.kind === "assistant" &&
        reply.runId === activeRunId &&
        reply.message &&
        hasMaterializedCardSnapshot(reply.message)
      ) {
        return false;
      }
    }
  }

  const isPendingRun = activeRunId === PENDING_RUN_ID;
  if (running || isPendingRun || !progress.finished) return true;

  if (progress.finished && activeRunId) {
    const anchoredIdx = insertIndexForActiveRun(items, activeRunId);
    if (anchoredIdx !== null) {
      const slot = items[anchoredIdx];
      if (slot?.kind === "assistant" && hasMaterializedCardSnapshot(slot.message)) {
        return false;
      }
    }
  }

  return false;
}

/**
 * Thread DB-first estilo Lovable: mensagens do banco + no máximo 1 overlay live.
 * Sem frozenRuns — histórico vem de cardSnapshot no meta da mensagem assistant.
 */
export function buildChatThread(
  messages: ChatMessage[],
  progress: AgentProgress,
  opts: BuildChatThreadOptions = {},
): ChatThreadItem[] {
  const { activeRunId, running = false } = opts;
  let items: ChatThreadItem[] = [];

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

  if (activeRunId) {
    const isPendingRun = activeRunId === PENDING_RUN_ID;
    if (shouldAttachLiveOverlay(items, activeRunId, progress, running)) {
      const anchored = insertIndexForActiveRun(items, activeRunId);
      const insertAt = anchored ?? pendingAssistantInsertIndex(items);
      const slotActive = (running || isPendingRun) && !progress.finished;
      items = insertAssistantSlot(items, insertAt, {
        kind: "assistant",
        live: progress,
        runId: activeRunId,
        isActive: slotActive,
      });
    }
    return dedupeThreadByRunId(items);
  }

  if (shouldAttachEphemeralOverlay(items, progress)) {
    const insertAt = pendingAssistantInsertIndex(items);
    const existing = items[insertAt];
    if (existing?.kind !== "assistant" || !existing.message?.content?.trim()) {
      items = insertAssistantSlot(items, insertAt, {
        kind: "assistant",
        live: progress,
        isActive: false,
      });
    }
  }

  return dedupeThreadByRunId(items);
}

/** Progress efetivo: live > DB materializado (cardSnapshot) > DB fraco. */
export function resolveAssistantProgress(
  item: Extract<ChatThreadItem, { kind: "assistant" }>,
): AgentProgress | null {
  if (item.live) return item.live;
  if (item.message && hasMaterializedCardSnapshot(item.message)) {
    return progressFromAssistantMessage(item.message);
  }
  return item.message ? progressFromAssistantMessage(item.message) : null;
}