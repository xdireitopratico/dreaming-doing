import { useMemo } from "react";
import type { PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { needsPlanApprovalNow, resolvePendingPlan } from "@/lib/plan-message-meta";

type UsePendingPlanInput = {
  livePlan: PendingPlan | null | undefined;
  messages: ChatMessage[];
  activeRunId?: string | null;
};

/** Plano pendente derivado — sem write-back no agente. */
export function usePendingPlan({
  livePlan,
  messages,
  activeRunId,
}: UsePendingPlanInput): PendingPlan | null {
  return useMemo(() => {
    const plan = resolvePendingPlan(livePlan, messages, activeRunId);
    return needsPlanApprovalNow(livePlan, messages, activeRunId) ? plan : null;
  }, [livePlan, messages, activeRunId]);
}