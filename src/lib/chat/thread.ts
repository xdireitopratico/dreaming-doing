import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  hasMaterializedCardSnapshot,
  runIdFromAssistantMessage,
} from "@/lib/assistant-run-progress";

import { isEntendiOpener } from "@/lib/narration-dedupe";
import { mapAssistantTurn } from "@/lib/chat/turn";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import type {
  BuildChatThreadOptions,
  RawThreadItem,
  ThreadItem,
} from "@/lib/chat/types";

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

function lastVisibleUserIndex(items: RawThreadItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind === "user" && !item.internal) return i;
  }
  return -1;
}

function assistantMessageText(msg: ChatMessage): string {
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

function isRepoImportMessage(msg: ChatMessage): boolean {
  const meta = msg.meta;
  return !!meta && typeof meta === "object" && meta.kind === "repo_import";
}

function isFailedAssistantMessage(msg: ChatMessage): boolean {
  const meta = msg.meta;
  if (meta && typeof meta === "object") {
    if (meta.buildFailed === true) return true;
    if (meta.lastFinishOk === false) return true;
  }
  const text = assistantMessageText(msg);
  return text.startsWith("Erro:");
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
function isReorderableOrphanAssistant(
  item: Extract<RawThreadItem, { kind: "assistant" }>,
): boolean {
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
      const userMeta = (msg.meta ?? {}) as Record<string, unknown>;
      if (userMeta.queued === true) continue;

      items.push({
        kind: "user",
        message: msg,
        internal: undefined,
      });
      continue;
    }

    const runId = runIdFromAssistantMessage(msg);
    const last = items[items.length - 1];
    const visibleText = assistantMessageText(msg);

    if (
      last?.kind === "assistant" &&
      !last.live &&
      !last.isActive &&
      !last.runId &&
      !runId &&
      visibleText &&
      last.message &&
      assistantMessageText(last.message) === visibleText
    ) {
      continue;
    }

    if (
      last?.kind === "assistant" &&
      !last.live &&
      !last.isActive &&
      isRepoImportMessage(msg) &&
      last.message &&
      isRepoImportMessage(last.message) &&
      assistantMessageText(last.message) === visibleText
    ) {
      continue;
    }

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





function buildRawThread(
  messages: ChatMessage[],
  progress: AgentProgress,
  opts: Pick<BuildChatThreadOptions, "activeRunId" | "running" | "focusedRunId">,
): RawThreadItem[] {
  let items = buildDbThread(messages);
  const running = opts.running ?? false;
  const activeRunId = opts.activeRunId;

  // Anexar .live (fonte de dados rica: narration, timeline, duration etc) para o activeRunId da sessão.
  // Sempre que o runId casa com um item do DB (mesmo finished), para hidratar o turn até o cardSnapshot materializar.
  // Synthetic (append) só se ainda executando (não duplicar finished no thread).
  // isActive só para execução + running da UI + não suprimido por foco no inspector histórico.
  if (activeRunId && progress) {
    const isExecuting = !progress.finished && !progress.canceled && !progress.awaiting;
    const suppressActive = !!opts.focusedRunId && opts.focusedRunId !== activeRunId;
    const isActiveOverlay = isExecuting && running && !suppressActive;

    // sempre tentar overlay no matching runId (permite "freeze" do progresso na mensagem DB fraca)
    let found = false;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === 'assistant' && it.runId === activeRunId) {
        items[i] = {
          ...it,
          live: progress,
          isActive: isActiveOverlay,
        } as RawThreadItem;
        found = true;
        break;
      }
    }
    if (!found) {
      // Injeta slot sintético para activeRunId para carregar narração / miniCard final do progresso
      // (mesmo finished) quando não há msg DB ainda. Evita vazar runs "stale" com awaiting/plan.
      const canSynthesizeFinished = !progress.awaiting && !progress.awaitingKind;
      if (isExecuting || canSynthesizeFinished) {
        items.push({
          kind: 'assistant',
          runId: activeRunId,
          live: progress,
          isActive: isActiveOverlay,
        } as RawThreadItem);
      }
    }
  }

  // Posiciona o live run logo após o último user (para que turn[1] seja o live quando há user recente).
  // Órfãos reorderáveis (Entendi sem run) ficam em suas posições relativas.
  items = ensureLiveRunAfterLastUser(items, activeRunId);

  return items;
}

function ensureLiveRunAfterLastUser(items: RawThreadItem[], activeRunId?: string | null): RawThreadItem[] {
  if (!activeRunId) return items;
  const liveIdx = items.findIndex(
    (it) => it.kind === "assistant" && it.runId === activeRunId && (it.live || it.isActive),
  );
  if (liveIdx < 0) return items;
  const lastUser = lastVisibleUserIndex(items);
  if (liveIdx > lastUser + 1) {
    const [liveItem] = items.splice(liveIdx, 1);
    items.splice(lastUser + 1, 0, liveItem);
  }
  return items;
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

  return raw.flatMap((item, itemIndex): ThreadItem[] => {
    if (item.kind === "user") {
      if (item.internal) return [];
      return [{ kind: "user", message: item.message }];
    }
    return [
      mapAssistantTurn(item, {
        messages,
        thread: raw,
        itemIndex,
        running,
        activeRunId: opts.activeRunId,
        activeRunStartedAtMs: opts.activeRunStartedAtMs,
        pendingPlan: opts.pendingPlan,
        sessionProgress: opts.sessionProgress,
        focusedRunId: opts.focusedRunId,
      }),
    ];
  });
}
