import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";
import { isAssistantRunMaterialized } from "@/lib/assistant-materialized";
import {
  hasMaterializedCardSnapshot,
  runIdFromAssistantMessage,
} from "@/lib/assistant-run-progress";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";
import { isEntendiOpener } from "@/lib/narration-dedupe";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import { scopeLiveState } from "@/lib/chat/session";
import { mapAssistantTurn } from "@/lib/chat/turn";
import type {
  BuildChatThreadOptions,
  ChatLiveState,
  RawThreadItem,
  ThreadItem,
} from "@/lib/chat/types";

function buildRunIdFromUser(msg: ChatMessage): string | null {
  const meta = msg.meta;
  if (!meta || typeof meta !== "object") return null;
  if (typeof meta.buildRunId === "string") return meta.buildRunId;
  return null;
}

/** Mensagem user só para LLM/âncora de build — não exibir no chat (espelha run-context.ts). */
export function isPlanApprovedUserMessage(msg: ChatMessage): boolean {
  const meta = msg.meta;
  if (!meta || typeof meta !== "object") return false;
  if (meta.kind === "plan_approved") return true;
  if (typeof meta.planSourceRunId === "string") return true;
  const text = msg.content?.trim() ?? "";
  if (text.startsWith("[Plano aprovado]")) return true;
  return /^Plano aprovado — executar em modo Build/i.test(text);
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

function lastVisibleUserIndex(items: RawThreadItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind === "user" && !item.internal) return i;
  }
  return -1;
}

function assistantVisibleText(item: Extract<RawThreadItem, { kind: "assistant" }>): string {
  const msg = item.message;
  if (!msg) return "";
  const parts = msg.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((p) => p && typeof p === "object" && (p as { type?: string }).type === "text")
      .map((p) => (p as { text?: string }).text ?? "")
      .join("\n")
      .trim();
  }
  return msg.content?.trim() ?? "";
}

/** Assistant órfão (narração parcial sem runId) antes do user — reordenar após o último user. */
function isReorderableOrphanAssistant(item: Extract<RawThreadItem, { kind: "assistant" }>): boolean {
  if (item.live || item.isActive) return false;
  if (item.runId) return false;
  if (item.message && hasMaterializedCardSnapshot(item.message)) return false;
  const text = assistantVisibleText(item);
  if (!text) return true;
  return isEntendiOpener(text);
}

/** Garante user visível antes de narração órfã do DB. */
function normalizeThreadOrder(items: RawThreadItem[]): RawThreadItem[] {
  const lastUserIdx = lastVisibleUserIndex(items);
  if (lastUserIdx < 0) return items;

  const head: RawThreadItem[] = [];
  const tail: RawThreadItem[] = [];
  const deferred: RawThreadItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (i < lastUserIdx && item.kind === "assistant" && isReorderableOrphanAssistant(item)) {
      deferred.push(item);
      continue;
    }
    if (i <= lastUserIdx) head.push(item);
    else tail.push(item);
  }

  if (deferred.length === 0) return items;
  return [...head, ...deferred, ...tail];
}

function buildDbThread(messages: ChatMessage[]): RawThreadItem[] {
  const items: RawThreadItem[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") continue;

    if (msg.role === "user") {
      items.push({
        kind: "user",
        message: msg,
        internal: isPlanApprovedUserMessage(msg) ? true : undefined,
      });
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

  return normalizeThreadOrder(items);
}

function isRunMaterializedInThread(items: RawThreadItem[], runId: string): boolean {
  for (const item of items) {
    if (item.kind !== "assistant" || item.runId !== runId) continue;
    if (item.message && isAssistantRunMaterialized(item.message)) return true;
  }
  return false;
}

function lastUnansweredUserIndex(items: RawThreadItem[]): number {
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

function anchorIndexForRun(items: RawThreadItem[], runId: string): number | null {
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
  items: RawThreadItem[],
  insertAt: number,
  slot: Extract<RawThreadItem, { kind: "assistant" }>,
  minInsertAt = 0,
): RawThreadItem[] {
  const next = [...items];
  const at = Math.max(insertAt, minInsertAt);

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
        const merged: Extract<RawThreadItem, { kind: "assistant" }> = {
          ...ex,
          ...slot,
          message: mergeMessageContent(ex.message, slot.message),
          live: slot.live ?? ex.live,
          isActive: slot.isActive || ex.isActive,
        };
        if (i < minInsertAt) {
          next.splice(i, 1);
          next.splice(Math.min(at, next.length), 0, merged);
        } else {
          next[i] = merged;
        }
        return next;
      }
    }
  }

  const existing = next[at];
  if (existing?.kind === "assistant" && slot.runId && existing.runId === slot.runId) {
    next[at] = {
      ...existing,
      ...slot,
      message: mergeMessageContent(existing.message, slot.message),
      live: slot.live ?? existing.live,
    };
    return next;
  }

  next.splice(at, 0, slot);
  return next;
}

function shouldShowLiveOverlay(items: RawThreadItem[], live: ChatLiveState): boolean {
  const { activeRunId, progress, running } = live;
  if (!activeRunId) return true;

  if (activeRunId !== PENDING_RUN_ID && isRunMaterializedInThread(items, activeRunId)) {
    return false;
  }

  const isPending = activeRunId === PENDING_RUN_ID;
  if (running || isPending || !progress.finished) return true;
  return shouldRetainLiveRunSlot(progress);
}

/** Congela progresso live no slot DB quando cardSnapshot ainda não chegou. */
function attachFrozenProgressToRun(
  items: RawThreadItem[],
  runId: string,
  progress: AgentProgress,
): RawThreadItem[] {
  return items.map((item) => {
    if (item.kind !== "assistant" || item.runId !== runId) return item;
    if (item.message && hasMaterializedCardSnapshot(item.message)) {
      if (progress.latencyThoughtMs != null && progress.latencyThoughtMs > 0) {
        return {
          ...item,
          live: item.live ?? progress,
          isActive: false,
        };
      }
      return item;
    }
    return {
      ...item,
      live: item.live ?? progress,
      isActive: false,
    };
  });
}

function applyLiveOverlay(items: RawThreadItem[], live: ChatLiveState): RawThreadItem[] {
  const { activeRunId, progress, running } = live;

  if (activeRunId && !shouldShowLiveOverlay(items, live)) {
    return attachFrozenProgressToRun(items, activeRunId, progress);
  }

  const isPending = activeRunId === PENDING_RUN_ID;
  const slotActive = activeRunId ? (running || isPending) && !progress.finished : false;

  const slot: Extract<RawThreadItem, { kind: "assistant" }> = {
    kind: "assistant",
    live: progress,
    runId: activeRunId ?? undefined,
    isActive: slotActive,
  };

  const lastUserIdx = lastVisibleUserIndex(items);
  const minInsertAt = lastUserIdx >= 0 ? lastUserIdx + 1 : 0;

  if (activeRunId) {
    let anchored = anchorIndexForRun(items, activeRunId);
    if (anchored != null && anchored < minInsertAt) anchored = null;
    const insertAt =
      anchored ??
      (() => {
        const u = lastUnansweredUserIndex(items);
        return u >= 0 ? u + 1 : items.length;
      })();
    return upsertLiveSlot(items, insertAt, slot, minInsertAt);
  }

  const insertAt = lastUnansweredUserIndex(items);
  if (insertAt < 0) return items;
  return upsertLiveSlot(items, insertAt + 1, { ...slot, isActive: false }, minInsertAt);
}

function buildRawThread(
  messages: ChatMessage[],
  progress: AgentProgress,
  opts: Pick<BuildChatThreadOptions, "activeRunId" | "running" | "focusedRunId">,
): RawThreadItem[] {
  const running = opts.running ?? false;
  const live = scopeLiveState(messages, progress, opts.activeRunId, running);
  let items = buildDbThread(messages);
  if (!live) return items;

  const focusedRunId = opts.focusedRunId;
  if (
    focusedRunId &&
    live.activeRunId &&
    focusedRunId !== live.activeRunId &&
    live.activeRunId !== PENDING_RUN_ID
  ) {
    return attachFrozenProgressToRun(items, live.activeRunId, live.progress);
  }

  return applyLiveOverlay(items, live);
}

/**
 * Thread do chat — DB cronológico + no máximo 1 overlay live.
 */
export function buildChatThread(
  messages: ChatMessage[],
  progress: AgentProgress,
  opts: BuildChatThreadOptions,
): ThreadItem[] {
  const raw = buildRawThread(messages, progress, opts);
  const running = opts.running ?? false;

  return raw.flatMap((item, itemIndex) => {
    if (item.kind === "user") {
      if (item.internal) return [];
      return [{ kind: "user", message: item.message }];
    }
    return [mapAssistantTurn(item, {
      messages,
      thread: raw,
      itemIndex,
      running,
      activeRunId: opts.activeRunId,
      activeRunStartedAtMs: opts.activeRunStartedAtMs,
      pendingPlan: opts.pendingPlan,
      sessionProgress: opts.sessionProgress,
      focusedRunId: opts.focusedRunId,
    })];
  });
}