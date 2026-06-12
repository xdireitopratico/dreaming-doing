import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { runBelongsToChatMessages } from "@/lib/plan-message-meta";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import type { ChatLiveState } from "@/lib/chat/types";

/** Estado live válido só para esta conversa — sem overlay efêmero fora de run ativo. */
export function scopeLiveState(
  messages: ChatMessage[],
  _progress: AgentProgress,
  activeRunId: string | null | undefined,
  running: boolean,
): ChatLiveState | null {
  const pendingTurn = activeRunId === PENDING_RUN_ID;
  const runInThread = activeRunId ? runBelongsToChatMessages(activeRunId, messages) : false;
  const belongs = pendingTurn || (running && !!activeRunId) || runInThread;

  if (!activeRunId || !belongs) {
    return null;
  }

  return { activeRunId, progress: _progress, running };
}

export function emptyProgress(): AgentProgress {
  return initialAgentProgress;
}