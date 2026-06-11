import type { AgentProgress } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import {
  hasMaterializedCardSnapshot,
  progressFromAssistantMessage,
} from "@/lib/assistant-run-progress";
import type { RawThreadItem } from "@/lib/chat/types";

/** Progresso do turno: DB materializado > live > DB fraco. */
export function resolveAssistantProgress(
  item: Extract<RawThreadItem, { kind: "assistant" }>,
): AgentProgress | null {
  if (item.message && hasMaterializedCardSnapshot(item.message)) {
    return progressFromAssistantMessage(item.message);
  }
  if (item.live) return item.live;
  return item.message ? progressFromAssistantMessage(item.message) : null;
}