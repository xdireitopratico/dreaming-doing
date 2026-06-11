import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { runBelongsToChatMessages } from "@/lib/plan-message-meta";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import type { ChatLiveState } from "@/lib/chat/types";

/** Estado live válido só para esta conversa. */
export function scopeLiveState(
  messages: ChatMessage[],
  progress: AgentProgress,
  activeRunId: string | null | undefined,
  running: boolean,
): ChatLiveState | null {
  const pendingTurn = activeRunId === PENDING_RUN_ID;
  const runInThread = activeRunId ? runBelongsToChatMessages(activeRunId, messages) : false;
  const belongs = pendingTurn || (running && !!activeRunId) || runInThread;

  if (!activeRunId || !belongs) {
    if (!activeRunId && canUseEphemeralProgress(messages, progress)) {
      return { activeRunId: null, progress, running: false };
    }
    return null;
  }

  return { activeRunId, progress, running };
}

function canUseEphemeralProgress(messages: ChatMessage[], progress: AgentProgress): boolean {
  if (!progress.finished) return false;
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return false;
  const lastUserIdx = messages.lastIndexOf(lastUser);
  const hasReply = messages.slice(lastUserIdx + 1).some((m) => {
    if (m.role !== "assistant") return false;
    return !!m.content?.trim();
  });
  if (hasReply) return false;

  const text = progress.streamText?.trim();
  if (progress.error && !progress.canceled) return true;
  if (text && progress.lastFinishOk === true) return true;
  if (text && (progress.conversational === true || progress.awaitingKind === "qualify")) {
    return true;
  }
  return false;
}

export function emptyProgress(): AgentProgress {
  return initialAgentProgress;
}