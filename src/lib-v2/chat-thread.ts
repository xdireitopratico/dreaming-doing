import type { ChatMessage, ChatState, MiniCardData, ThreadItem } from "./chat-types";

export function buildChatThread(messages: ChatMessage[], state: ChatState): ThreadItem[] {
  const items: ThreadItem[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") continue;

    if (msg.role === "user") {
      items.push({ kind: "user", message: msg });
      continue;
    }

    if (msg.role === "assistant") {
      const existing = findLastAssistantByRunId(items, msg.runId);
      if (existing && existing.runId === msg.runId) {
        existing.message = mergeMessages(existing.message, msg);
      } else {
        items.push({
          kind: "assistant",
          message: msg,
          runId: msg.runId ?? `msg-${msg.id}`,
          isActive: false,
          streamText: null,
        });
      }
    }
  }

  if (state.status === "running" && state.runId) {
    const existing = items.find((i) => i.kind === "assistant" && i.runId === state.runId);
    if (existing && existing.kind === "assistant") {
      existing.isActive = true;
      existing.streamText = state.streamText;
      existing.phase = state.phase;
      existing.phaseMessage = state.phaseMessage;
      existing.thinking = state.thinking;
      existing.narration = state.narration;
      existing.miniCard = buildMiniCard(state);
      existing.plan = state.plan;
      existing.planStatus = state.planStatus;
      existing.qualify = state.qualify;
    } else {
      items.push({
        kind: "assistant",
        runId: state.runId,
        isActive: true,
        streamText: state.streamText,
        phase: state.phase,
        phaseMessage: state.phaseMessage,
        thinking: state.thinking,
        narration: state.narration,
        miniCard: buildMiniCard(state),
        plan: state.plan,
        planStatus: state.planStatus,
        qualify: state.qualify,
      });
    }
  }

  if (state.status === "error" && state.error) {
    const lastAssistant = findLastAssistantByRunId(items, state.runId ?? undefined);
    if (lastAssistant) {
      lastAssistant.error = state.error;
      lastAssistant.finished = true;
    }
  }

  return items;
}

function buildMiniCard(state: ChatState): MiniCardData | null {
  if (!state.runId) return null;
  return {
    title: state.phaseMessage ?? state.phase ?? "Working...",
    liveBriefings: state.phaseMessage ? [state.phaseMessage] : [],
    status: state.error ? "failed" : state.finished ? "done" : "working",
    tasks: state.tasks ?? [],
    currentTaskIndex: state.currentTaskIndex ?? 0,
    editedFile: state.editedFile,
    fileCount: state.fileCount,
    hasPlan: state.hasPlan,
    planReady: state.planReady,
  };
}

function findLastAssistantByRunId(
  items: ThreadItem[],
  runId?: string,
): Extract<ThreadItem, { kind: "assistant" }> | null {
  if (!runId) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "assistant" && item.runId === runId) return item;
  }
  return null;
}

function mergeMessages(a: ChatMessage | undefined, b: ChatMessage): ChatMessage {
  if (!a) return b;
  const content = [a.content, b.content].filter((c) => c?.trim()).join("\n\n") || b.content;
  return { ...b, content };
}
