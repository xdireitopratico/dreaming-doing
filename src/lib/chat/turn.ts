import type { AgentProgress, PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { buildAgentRunView, isRunEffectivelyActive, shouldShowJobCard } from "@/lib/forge-run";
import { isAgentJobMessage } from "@/lib/assistant-run-progress";
import { resolveJobPlanForRun, storedPlanFromMessage } from "@/lib/plan-message-meta";
import { parseQualifyChoices } from "@/lib/qualify-choices";
import { resolveAssistantProgress } from "@/lib/chat/resolve-progress";
import type {
  MiniCardData,
  PlanPrompt,
  QualifyPrompt,
  RawThreadItem,
  RunPhase,
  ThreadItem,
} from "@/lib/chat/types";

export type TurnContext = {
  messages: ChatMessage[];
  thread: RawThreadItem[];
  itemIndex: number;
  running: boolean;
  activeRunId?: string | null;
  activeRunStartedAtMs?: number | null;
  pendingPlan?: PendingPlan | null;
  sessionProgress: AgentProgress;
  focusedRunId?: string | null;
};

function toMiniCard(
  runView: NonNullable<ReturnType<typeof buildAgentRunView>>,
): MiniCardData {
  const m = runView.miniCard;
  return {
    title: m.title || m.header,
    liveBriefings: m.liveBriefings.length > 0 ? m.liveBriefings : [m.subtitle || m.header],
    status: m.status,
    tasks: m.tasks,
    currentTaskIndex: m.currentTaskIndex,
    editedFile: m.editedFile,
    fileCount: m.fileCount,
    hasPlan: m.hasPlan,
    planReady: m.planReady,
  };
}

function toPlanPrompt(plan: PendingPlan): PlanPrompt {
  return {
    planId: plan.planId,
    summary: plan.summary,
    mission: plan.mission,
    objective: plan.objective,
    steps: plan.steps.map((s) => ({
      id: s.id,
      type: s.type,
      description: s.description,
      enabled: s.enabled,
    })),
    runId: plan.runId,
  };
}

export function mapAssistantTurn(
  item: Extract<RawThreadItem, { kind: "assistant" }>,
  ctx: TurnContext,
): Extract<ThreadItem, { kind: "assistant" }> {
  const { thread, itemIndex, messages, running, activeRunId, sessionProgress } = ctx;

  let userPrompt: string | null = null;
  for (let j = itemIndex - 1; j >= 0; j--) {
    const prev = thread[j];
    if (prev?.kind === "user") {
      userPrompt = prev.message.content?.trim() ?? null;
      break;
    }
  }

  const resolved = resolveAssistantProgress(item);
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

  const isLastTurn =
    itemIndex === thread.length - 1 ||
    !thread.slice(itemIndex + 1).some((t) => t.kind === "assistant");
  const closingText = runView?.closingText ?? item.message?.content?.trim() ?? null;
  const parsedQualify = closingText ? parseQualifyChoices(closingText) : null;

  const qualifyInteractive =
    isLastTurn &&
    !running &&
    !slotActive &&
    !!parsedQualify &&
    (sessionProgress.awaitingKind === "qualify" ||
      sessionProgress.awaiting ||
      resolved?.awaitingKind === "qualify");

  let qualify: QualifyPrompt | null = null;
  if (qualifyInteractive && parsedQualify) {
    qualify = {
      intro: parsedQualify.intro || undefined,
      question: parsedQualify.question || undefined,
      choices: parsedQualify.choices.map((c) => ({
        label: c.label,
        description: c.description,
      })),
    };
  }

  const latency = runView?.latencyThinking;
  const reasoning = runView?.reasoningThought;
  const thinking =
    latency || reasoning
      ? {
          active: !!(latency?.active || reasoning?.active),
          startedAtMs: latency?.startedAtMs,
          durationMs: latency?.durationMs ?? reasoning?.durationMs,
        }
      : null;

  const streamText = closingText ?? resolved?.streamText ?? null;
  const showCard = showJobCard || planTeaser;

  return {
    kind: "assistant",
    message: item.message,
    runId,
    isActive: slotActive,
    streamText,
    phase: (resolved?.phase as RunPhase) ?? null,
    phaseMessage: resolved?.message ?? resolved?.statusHint ?? null,
    thinking,
    narration: runView?.narration ?? resolved?.narrationText ?? null,
    miniCard: showCard && runView ? toMiniCard(runView) : null,
    qualify,
    plan: planTeaser && planForPrompt ? toPlanPrompt(planForPrompt) : null,
    planStatus: planStatus ?? (planTeaser ? "pending" : null),
    error: runView?.error ?? resolved?.error ?? null,
    finished: runView?.finished ?? resolved?.finished ?? false,
    lastFinishOk: runView?.lastFinishOk ?? resolved?.lastFinishOk ?? undefined,
    resumable: runView?.resumable ?? resolved?.resumable ?? false,
  };
}