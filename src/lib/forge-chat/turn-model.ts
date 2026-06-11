import type { AgentProgress, PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import type { AgentRunView } from "@/lib/forge-run";
import { buildAgentRunView, isRunEffectivelyActive, shouldShowJobCard } from "@/lib/forge-run";
import { isAgentJobMessage } from "@/lib/assistant-run-progress";
import { resolveJobPlanForRun, storedPlanFromMessage } from "@/lib/plan-message-meta";
import { parseQualifyChoices } from "@/lib/qualify-choices";
import type { ForgeChatThreadItem } from "@/lib/forge-chat/types";
import { resolveForgeAssistantProgress } from "@/lib/forge-chat/build-thread";

export type ForgeTurnContext = {
  messages: ChatMessage[];
  thread: ForgeChatThreadItem[];
  itemIndex: number;
  running: boolean;
  activeRunId?: string | null;
  activeRunStartedAtMs?: number | null;
  pendingPlan?: PendingPlan | null;
  sessionProgress: AgentProgress;
  onOpenInspector?: boolean;
  onQualifySelect?: boolean;
};

export type ForgeAssistantTurnModel = {
  stableKey: string;
  runId: string;
  message?: ChatMessage;
  runView: AgentRunView | null;
  progress: AgentProgress | null;
  isActive: boolean;
  isFocused: boolean;
  showJobCard: boolean;
  qualifyInteractive: boolean;
  planTeaser: boolean;
  jobPlan: PendingPlan | null;
};

export function buildAssistantTurnModel(
  item: Extract<ForgeChatThreadItem, { kind: "assistant" }>,
  ctx: ForgeTurnContext,
  focusedRunId?: string | null,
): ForgeAssistantTurnModel {
  const { thread, itemIndex, messages, running, activeRunId, sessionProgress } = ctx;

  let userPrompt: string | null = null;
  for (let j = itemIndex - 1; j >= 0; j--) {
    const prev = thread[j];
    if (prev?.kind === "user") {
      userPrompt = prev.message.content?.trim() ?? null;
      break;
    }
  }

  const resolved = resolveForgeAssistantProgress(item);
  const runId = item.runId ?? activeRunId ?? `slot-${itemIndex}`;

  const anchoredLive =
    !!running &&
    !!activeRunId &&
    !!item.runId &&
    item.runId === activeRunId &&
    !!resolved &&
    !resolved.finished &&
    !resolved.canceled;

  const isQualifyOnly =
    !!resolved &&
    resolved.awaitingKind === "qualify" &&
    !!resolved.awaiting &&
    !anchoredLive &&
    (resolved.tools?.length ?? 0) === 0 &&
    (resolved.diffs?.length ?? 0) === 0 &&
    (resolved.deliveryFiles?.length ?? 0) === 0;

  const hasExecutionEvidence =
    !!resolved &&
    ((resolved.timeline?.length ?? 0) > 0 ||
      (resolved.tools?.length ?? 0) > 0 ||
      (resolved.diffs?.length ?? 0) > 0 ||
      (resolved.deliveryFiles?.length ?? 0) > 0 ||
      resolved.phase === "gather" ||
      resolved.phase === "classify" ||
      resolved.phase === "plan" ||
      resolved.phase === "execute" ||
      resolved.phase === "observe" ||
      resolved.phase === "summarize");

  const slotActive = resolved
    ? isRunEffectivelyActive(resolved, item.isActive || anchoredLive)
    : item.isActive || anchoredLive;

  const showJobCard = shouldShowJobCard({
    runId: item.runId,
    progress: resolved,
    isQualifyOnly,
    isAgentJobMessage: isAgentJobMessage(item.message),
    hasExecutionEvidence,
    slotActive,
    activeRunId,
  });

  const jobPlan = item.runId
    ? resolveJobPlanForRun(item.runId, messages, {
        livePlan:
          ctx.pendingPlan && ctx.pendingPlan.runId === item.runId ? ctx.pendingPlan : null,
        progressPlan: resolved?.pendingPlan ?? null,
        assistantMessage: item.message,
      })
    : null;

  const runStartedAtMs = item.runId === activeRunId ? (ctx.activeRunStartedAtMs ?? null) : null;

  const msgPlanMeta = item.message ? storedPlanFromMessage(item.message) : null;
  const planStatus = msgPlanMeta?.status ?? null;
  const planForPrompt = jobPlan ?? msgPlanMeta?.plan ?? null;
  const planAwaitingApproval =
    sessionProgress.awaitingKind === "plan_approval" ||
    resolved?.awaitingKind === "plan_approval";
  const planRunMatches =
    (!!ctx.pendingPlan?.runId && ctx.pendingPlan.runId === item.runId) ||
    msgPlanMeta?.plan.runId === item.runId;
  const planAlreadyDecided = planStatus === "approved" || planStatus === "rejected";
  const planTeaser =
    !!ctx.onOpenInspector &&
    !!planForPrompt?.steps?.length &&
    planRunMatches &&
    !planAlreadyDecided &&
    (msgPlanMeta?.status === "pending" || planAwaitingApproval);

  const runView = resolved
    ? buildAgentRunView(runId, resolved, {
        running: slotActive,
        jobPlan,
        userPrompt,
        runStartedAtMs,
        forcePlanReady: planTeaser,
      })
    : null;

  const stableKey = item.runId
    ? `assistant-${item.runId}`
    : item.message?.id
      ? `msg-${item.message.id}`
      : `slot-${itemIndex}`;

  const isLastTurn =
    itemIndex === thread.length - 1 ||
    !thread.slice(itemIndex + 1).some((t) => t.kind === "assistant");
  const closingText = runView?.closingText ?? item.message?.content?.trim() ?? null;
  const parsedQualify = closingText ? parseQualifyChoices(closingText) : null;
  const qualifyInteractive =
    !!ctx.onQualifySelect &&
    isLastTurn &&
    !running &&
    !slotActive &&
    !!parsedQualify &&
    (sessionProgress.awaitingKind === "qualify" ||
      sessionProgress.awaiting ||
      resolved?.awaitingKind === "qualify");

  return {
    stableKey,
    runId,
    message: item.message,
    runView,
    progress: resolved,
    isActive: slotActive,
    isFocused: !!item.runId && focusedRunId === item.runId,
    showJobCard: showJobCard || planTeaser,
    qualifyInteractive,
    planTeaser,
    jobPlan: planForPrompt,
  };
}