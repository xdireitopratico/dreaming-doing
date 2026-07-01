import { useMemo } from "react";
import type { PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import {
  isPendingPlanMaterializing,
  needsPlanApprovalNow,
  resolvePendingPlan,
} from "@/lib/plan-message-meta";

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
    if (isPendingPlanMaterializing(plan, activeRunId)) return plan;
    return needsPlanApprovalNow(livePlan, messages, activeRunId) ? plan : null;
  }, [livePlan, messages, activeRunId]);
}
