import type { AgentProgress } from "@/lib/agent-progress";
import {
  pickRicherProgress,
  progressFromAssistantMessage,
} from "@/lib/assistant-run-progress";
import type { RawThreadItem } from "@/lib/chat/types";

/** Progresso do turno: live/frozen > DB rico > DB fraco (paridade com inspector). */
export function resolveAssistantProgress(
  item: Extract<RawThreadItem, { kind: "assistant" }>,
): AgentProgress | null {
  const fromDb = item.message ? progressFromAssistantMessage(item.message) : null;
  if (item.live) {
    return pickRicherProgress(item.live, fromDb) ?? fromDb ?? item.live;
  }
  return fromDb;
}