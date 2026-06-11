import type { ChatMessage, ChatState, ThreadItem } from "@/lib-v2/chat-types";

function getRunId(msg: ChatMessage): string | undefined {
  const meta = msg.meta;
  if (meta && typeof meta === "object" && typeof meta.runId === "string") return meta.runId;
  return msg.runId;
}

function mergeContent(a?: ChatMessage, b?: ChatMessage): ChatMessage | undefined {
  if (!a) return b;
  if (!b) return a;
  const aText = a.content?.trim() ?? "";
  const bText = b.content?.trim() ?? "";
  const content =
    !aText || !bText || aText === bText || bText.includes(aText)
      ? bText || aText
      : [aText, bText].join("\n\n");
  return { ...b, content };
}

export function buildChatThread(messages: ChatMessage[], state: ChatState): ThreadItem[] {
  const items: ThreadItem[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") continue;

    if (msg.role === "user") {
      items.push({ kind: "user", message: msg });
      continue;
    }

    const runId = getRunId(msg);
    const last = items[items.length - 1];
    if (
      runId &&
      last?.kind === "assistant" &&
      last.runId === runId &&
      !last.isActive
    ) {
      items[items.length - 1] = {
        ...last,
        message: mergeContent(last.message, msg),
      };
    } else {
      items.push({
        kind: "assistant",
        message: msg,
        runId: runId ?? msg.id,
        isActive: false,
        streamText: null,
      });
    }
  }

  if (state.runId) {
    const existingIdx = items.findIndex(
      (it) => it.kind === "assistant" && it.runId === state.runId,
    );

    const liveItem: Extract<ThreadItem, { kind: "assistant" }> = {
      kind: "assistant",
      runId: state.runId,
      isActive: state.status === "running",
      streamText: state.streamText,
      phase: state.phase,
      phaseMessage: state.phaseMessage,
      thinking: state.thinking,
      narration: state.narration,
      miniCard: state.editedFile
        ? {
            title: state.phase ?? "working",
            liveBriefings: state.narration ? [state.narration] : [],
            status: state.status === "running" ? "working" : state.status === "error" ? "failed" : "done",
            tasks: state.tasks ?? [],
            currentTaskIndex: state.currentTaskIndex ?? 0,
            editedFile: state.editedFile,
            fileCount: state.fileCount,
            hasPlan: state.hasPlan,
            planReady: state.planReady,
          }
        : null,
      qualify: state.qualify,
      plan: state.plan,
      planStatus: state.planStatus,
      error: state.error,
      finished: state.finished,
      lastFinishOk: state.lastFinishOk,
      resumable: state.resumable,
    };

    if (existingIdx >= 0) {
      const existing = items[existingIdx];
      if (existing.kind === "assistant") {
        items[existingIdx] = {
          ...existing,
          isActive: liveItem.isActive,
          streamText: liveItem.streamText ?? existing.streamText,
          phase: liveItem.phase ?? existing.phase,
          phaseMessage: liveItem.phaseMessage ?? existing.phaseMessage,
          thinking: liveItem.thinking ?? existing.thinking,
          narration: liveItem.narration ?? existing.narration,
          miniCard: liveItem.miniCard ?? existing.miniCard,
          qualify: liveItem.qualify ?? existing.qualify,
          plan: liveItem.plan ?? existing.plan,
          planStatus: liveItem.planStatus ?? existing.planStatus,
          error: liveItem.error ?? existing.error,
          finished: liveItem.finished ?? existing.finished,
          lastFinishOk: liveItem.lastFinishOk ?? existing.lastFinishOk,
          resumable: liveItem.resumable ?? existing.resumable,
        };
      }
    } else {
      items.push(liveItem);
    }
  }

  return items;
}
