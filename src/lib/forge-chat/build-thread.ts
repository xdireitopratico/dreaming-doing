import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  hasMaterializedCardSnapshot,
  progressFromAssistantMessage,
  runIdFromAssistantMessage,
} from "@/lib/assistant-run-progress";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";
import { scopeLiveState } from "@/lib/forge-chat/session-scope";
import {
  PENDING_RUN_ID,
  type BuildForgeChatThreadOptions,
  type ForgeChatLiveState,
  type ForgeChatThreadItem,
} from "@/lib/forge-chat/types";

function buildRunIdFromUser(msg: ChatMessage): string | null {
  const meta = msg.meta;
  if (!meta || typeof meta !== "object") return null;
  if (typeof meta.buildRunId === "string") return meta.buildRunId;
  return null;
}

function mergeMessageContent(a?: ChatMessage, b?: ChatMessage): ChatMessage | undefined {
  if (!a) return b;
  if (!b) return a;
  const aText = a.content?.trim() ?? "";
  const bText = b.content?.trim() ?? "";
  const content =
    !aText || !bText || aText === bText || bText.includes(aText)
      ? bText || aText
      : [aText, bText].join("\n\n");
  return {
    ...b,
    content,
    toolCalls: b.toolCalls?.length ? b.toolCalls : a.toolCalls,
  };
}

/** Passo 1: histórico DB em ordem cronológica estrita. */
function buildDbThread(messages: ChatMessage[]): ForgeChatThreadItem[] {
  const items: ForgeChatThreadItem[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") continue;

    if (msg.role === "user") {
      items.push({ kind: "user", message: msg });
      continue;
    }

    const runId = runIdFromAssistantMessage(msg);
    const last = items[items.length - 1];
    if (
      runId &&
      last?.kind === "assistant" &&
      last.runId === runId &&
      !last.live &&
      !last.isActive
    ) {
      items[items.length - 1] = {
        ...last,
        message: mergeMessageContent(last.message, msg),
        runId,
      };
    } else {
      items.push({
        kind: "assistant",
        message: msg,
        runId,
        isActive: false,
      });
    }
  }

  return items;
}

function isRunMaterializedInThread(items: ForgeChatThreadItem[], runId: string): boolean {
  for (const item of items) {
    if (item.kind !== "assistant" || item.runId !== runId) continue;
    if (item.message && hasMaterializedCardSnapshot(item.message)) return true;
  }
  return false;
}

function lastUnansweredUserIndex(items: ForgeChatThreadItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind !== "user") continue;
    const next = items[i + 1];
    if (!next || next.kind !== "assistant") return i;
    if (
      next.kind === "assistant" &&
      !next.live &&
      !next.message?.content?.trim() &&
      !hasMaterializedCardSnapshot(next.message)
    ) {
      return i;
    }
  }
  return -1;
}

function anchorIndexForRun(items: ForgeChatThreadItem[], runId: string): number | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind === "user" && buildRunIdFromUser(item.message) === runId) {
      return i + 1;
    }
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind === "assistant" && item.runId === runId) return i;
  }
  return null;
}

function upsertLiveSlot(
  items: ForgeChatThreadItem[],
  insertAt: number,
  slot: Extract<ForgeChatThreadItem, { kind: "assistant" }>,
): ForgeChatThreadItem[] {
  const next = [...items];

  if (slot.runId) {
    for (let i = 0; i < next.length; i++) {
      const ex = next[i];
      if (ex?.kind !== "assistant") continue;
      if (ex.runId === PENDING_RUN_ID && slot.runId !== PENDING_RUN_ID) {
        next[i] = {
          ...ex,
          ...slot,
          message: mergeMessageContent(ex.message, slot.message),
          runId: slot.runId,
        };
        return next;
      }
      if (ex.runId === slot.runId) {
        next[i] = {
          ...ex,
          ...slot,
          message: mergeMessageContent(ex.message, slot.message),
          live: slot.live ?? ex.live,
          isActive: slot.isActive || ex.isActive,
        };
        return next;
      }
    }
  }

  const at = next[insertAt];
  if (at?.kind === "assistant" && slot.runId && at.runId === slot.runId) {
    next[insertAt] = {
      ...at,
      ...slot,
      message: mergeMessageContent(at.message, slot.message),
      live: slot.live ?? at.live,
    };
    return next;
  }

  next.splice(insertAt, 0, slot);
  return next;
}

function shouldShowLiveOverlay(
  items: ForgeChatThreadItem[],
  live: ForgeChatLiveState,
): boolean {
  const { activeRunId, progress, running } = live;
  if (!activeRunId) return true;

  if (activeRunId !== PENDING_RUN_ID && isRunMaterializedInThread(items, activeRunId)) {
    return false;
  }

  const isPending = activeRunId === PENDING_RUN_ID;
  if (running || isPending || !progress.finished) return true;
  return shouldRetainLiveRunSlot(progress);
}

function applyLiveOverlay(
  items: ForgeChatThreadItem[],
  live: ForgeChatLiveState,
): ForgeChatThreadItem[] {
  const { activeRunId, progress, running } = live;

  if (activeRunId && !shouldShowLiveOverlay(items, live)) {
    return items;
  }

  const isPending = activeRunId === PENDING_RUN_ID;
  const slotActive = activeRunId
    ? (running || isPending) && !progress.finished
    : false;

  const slot: Extract<ForgeChatThreadItem, { kind: "assistant" }> = {
    kind: "assistant",
    live: progress,
    runId: activeRunId ?? undefined,
    isActive: slotActive,
  };

  if (activeRunId) {
    const anchored = anchorIndexForRun(items, activeRunId);
    const insertAt =
      anchored ??
      (() => {
        const u = lastUnansweredUserIndex(items);
        return u >= 0 ? u + 1 : items.length;
      })();
    return upsertLiveSlot(items, insertAt, slot);
  }

  const insertAt = lastUnansweredUserIndex(items);
  if (insertAt < 0) return items;
  return upsertLiveSlot(items, insertAt + 1, { ...slot, isActive: false });
}

/**
 * Thread FORGE — reescrito do zero:
 * 1. DB cronológico (fonte de verdade)
 * 2. No máximo 1 overlay live escopado à conversa
 * 3. Live cede quando DB materializou
 */
export function buildForgeChatThread(
  messages: ChatMessage[],
  progress: AgentProgress,
  opts: BuildForgeChatThreadOptions = {},
): ForgeChatThreadItem[] {
  const running = opts.running ?? false;
  const live = scopeLiveState(messages, progress, opts.activeRunId, running);
  let items = buildDbThread(messages);
  if (!live) return items;
  return applyLiveOverlay(items, live);
}

/** Progresso do turno: DB materializado > live > DB fraco. */
export function resolveForgeAssistantProgress(
  item: Extract<ForgeChatThreadItem, { kind: "assistant" }>,
): AgentProgress | null {
  if (item.message && hasMaterializedCardSnapshot(item.message)) {
    return progressFromAssistantMessage(item.message);
  }
  if (item.live) return item.live;
  return item.message ? progressFromAssistantMessage(item.message) : null;
}