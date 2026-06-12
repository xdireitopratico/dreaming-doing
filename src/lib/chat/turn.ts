import type { AgentProgress, PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import {
  buildAgentRunView,
  isRunEffectivelyActive,
  shouldShowJobCard,
} from "@/lib/forge-run";
import {
  hasMaterializedCardSnapshot,
  isAgentJobMessage,
} from "@/lib/assistant-run-progress";
import { resolveJobPlanForRun, storedPlanFromMessage } from "@/lib/plan-message-meta";
import { parseClarifyChoices } from "@/lib/clarify-choices";
import { resolveAssistantProgress } from "@/lib/chat/resolve-progress";
import { enforceAssistantTurnInvariant } from "@/lib/chat/invariants";
import { resolveTurnNarration, resolveTurnThinking } from "@/lib/chat/turn-display";
import { resolveHistoricalRunProgress } from "@/lib/assistant-run-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import type {
  MiniCardData,
  ClarifyPrompt,
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
    header: m.header,
    subtitle: m.subtitle,
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

  let resolved = resolveAssistantProgress(item);
  const runId = item.runId ?? activeRunId ?? `slot-${itemIndex}`;

  if (!resolved && runId && item.runId === activeRunId) {
    resolved = sessionProgress;
  }
  if (!resolved && item.runId) {
    resolved = resolveHistoricalRunProgress(item.runId, messages);
  }
  if (!resolved && item.message?.content?.trim()) {
    resolved = {
      ...initialAgentProgress,
      finished: true,
      streamText: item.message.content.trim(),
      conversational: true,
    };
  }

  const anchoredLive =
    !!running &&
    !!activeRunId &&
    !!item.runId &&
    item.runId === activeRunId &&
    !!resolved &&
    !resolved.finished &&
    !resolved.canceled;

  const isClarifyOnly =
    !!resolved &&
    (resolved.awaitingKind === "clarify" ||
      (resolved.awaitingKind as string | null) === "qualify") &&
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
      resolved.phase === "plan" ||
      resolved.phase === "build" ||
      resolved.phase === "execute" ||
      resolved.phase === "observe" ||
      resolved.phase === "summarize");

  const slotActive = resolved
    ? isRunEffectivelyActive(resolved, item.isActive || anchoredLive)
    : item.isActive || anchoredLive;

  const showJobCard = shouldShowJobCard({
    runId: item.runId,
    progress: resolved,
    isClarifyOnly,
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

  const isLiveTurn =
    item.isActive || anchoredLive || (!!activeRunId && item.runId === activeRunId);
  const runStartedAtMs = isLiveTurn
    ? (ctx.activeRunStartedAtMs ?? null)
    : resolved?.latencyThoughtMs && resolved.latencyThoughtMs > 0
      ? Date.now() - resolved.latencyThoughtMs
      : null;

  const msgPlanMeta = item.message ? storedPlanFromMessage(item.message) : null;
  const planStatus = msgPlanMeta?.status ?? null;
  const planTeaser = false;

  const runView = resolved
    ? buildAgentRunView(runId, resolved, {
        running: slotActive,
        jobPlan,
        userPrompt,
        runStartedAtMs,
      })
    : null;

  const isLastTurn =
    itemIndex === thread.length - 1 ||
    !thread.slice(itemIndex + 1).some((t) => t.kind === "assistant");
  const closingText = runView?.closingText ?? item.message?.content?.trim() ?? null;
  const parsedClarify = closingText ? parseClarifyChoices(closingText) : null;

  const clarifyInteractive =
    isLastTurn &&
    !running &&
    !slotActive &&
    !!parsedClarify &&
    (sessionProgress.awaitingKind === "clarify" ||
      (sessionProgress.awaitingKind as string | null) === "qualify" ||
      sessionProgress.awaiting ||
      resolved?.awaitingKind === "clarify" ||
      (resolved?.awaitingKind as string | null) === "qualify");

  let clarify: ClarifyPrompt | null = null;
  if (clarifyInteractive && parsedClarify) {
    clarify = {
      intro: parsedClarify.intro || undefined,
      question: parsedClarify.question || undefined,
      choices: parsedClarify.choices.map((c) => ({
        label: c.label,
        description: c.description,
      })),
    };
  }

  const rawStreamText = closingText ?? resolved?.streamText ?? null;
  const thinking = resolveTurnThinking(resolved, runView, runStartedAtMs, slotActive);
  const narration = resolveTurnNarration(resolved, runView, rawStreamText);
  let streamText = planTeaser ? null : rawStreamText;
  if (
    !streamText &&
    resolved?.error?.trim() &&
    resolved.finished &&
    !slotActive
  ) {
    streamText = resolved.error.trim();
  }
  if (slotActive && showJobCard && streamText) streamText = null;

  const persistMiniCard =
    !!runView &&
    (planTeaser ||
      showJobCard ||
      (!!item.message && hasMaterializedCardSnapshot(item.message)));
  const showCard = persistMiniCard;

  const miniCard = showCard && runView ? toMiniCard(runView) : null;

  const turn: Extract<ThreadItem, { kind: "assistant" }> = {
    kind: "assistant",
    message: item.message,
    runId,
    isActive: slotActive,
    streamText,
    phase: (resolved?.phase as RunPhase) ?? null,
    phaseMessage: resolved?.message ?? resolved?.statusHint ?? null,
    thinking,
    narration,
    miniCard,
    statusChips: [],
    planTeaser,
    clarify,
    plan: null,
    planStatus: planStatus ?? (planTeaser ? "pending" : null),
    error: runView?.error ?? resolved?.error ?? null,
    finished: runView?.finished ?? resolved?.finished ?? false,
    lastFinishOk: runView?.lastFinishOk ?? resolved?.lastFinishOk ?? undefined,
    resumable: runView?.resumable ?? resolved?.resumable ?? false,
  };

  return enforceAssistantTurnInvariant(turn);
}