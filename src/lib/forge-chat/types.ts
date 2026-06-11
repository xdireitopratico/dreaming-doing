import type { AgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";

/** RunId sintético — turno otimista antes do runId real. */
export const PENDING_RUN_ID = "__pending__";

export type ForgeChatThreadItem =
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant";
      message?: ChatMessage;
      live?: AgentProgress;
      runId?: string;
      isActive: boolean;
    };

export type ForgeChatLiveState = {
  activeRunId: string | null;
  progress: AgentProgress;
  running: boolean;
};

export type BuildForgeChatThreadOptions = {
  activeRunId?: string | null;
  running?: boolean;
};