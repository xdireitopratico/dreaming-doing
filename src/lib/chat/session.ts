import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { shouldRetainLiveRunSlot } from "@/lib/live-run-overlay";
import { runBelongsToChatMessages } from "@/lib/plan-message-meta";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";
import type { ChatLiveState } from "@/lib/chat/types";

/** Estado live válido só para esta conversa — sem overlay efêmero fora de run ativo. */
export function scopeLiveState(
  messages: ChatMessage[],
  progress: AgentProgress,
  activeRunId: string | null | undefined,
  running: boolean,
): ChatLiveState | null {
  if (!activeRunId) return null;

  const pendingTurn = activeRunId === PENDING_RUN_ID;
  const runInThread = runBelongsToChatMessages(activeRunId, messages);
  const retainUntilDb =
    progress.finished && shouldRetainLiveRunSlot(progress) && messages.length > 0;

  const belongs =
    pendingTurn ||
    (running && !!activeRunId) ||
    runInThread ||
    !progress.finished ||
    retainUntilDb;

  if (!belongs) return null;

  return { activeRunId, progress, running };
}

export function emptyProgress(): AgentProgress {
  return initialAgentProgress;
}