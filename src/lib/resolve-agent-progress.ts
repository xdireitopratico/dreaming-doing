import type { ChatMessage } from "@/lib/chat-types";
import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import { resolvePendingPlan } from "@/lib/plan-message-meta";

/** Mescla progresso live com plano pendente reidratado do histórico. */
export function resolveEffectiveAgentProgress(
  progress: AgentProgress | null | undefined,
  messages: ChatMessage[],
): AgentProgress {
  const base = progress ?? initialAgentProgress;
  const pendingPlan = resolvePendingPlan(base.pendingPlan, messages);

  if (pendingPlan) {
    return {
      ...base,
      pendingPlan,
      awaiting: true,
      awaitingKind: "plan_approval",
    };
  }

  if (base.awaitingKind === "plan_approval") {
    return { ...base, awaiting: false, awaitingKind: null };
  }

  return base;
}