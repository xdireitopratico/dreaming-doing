import type { AgentProgress, PendingPlan } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import { buildAgentRunView, hasActiveJob, shouldShowJobCard } from "@/lib/forge-run";
import { hasMaterializedCardSnapshot, isAgentJobMessage } from "@/lib/assistant-run-progress";
import { resolveJobPlanForRun } from "@/lib/plan-message-meta";
import { parseClarifyChoices } from "@/lib/clarify-choices";
import { resolveAssistantProgress } from "@/lib/chat/resolve-progress";
import { enforceAssistantTurnInvariant } from "@/lib/chat/invariants";
import {
  resolveTurnNarration,
  resolveTurnThinkingLine,
} from "@/lib/chat/turn-display";
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

function toMiniCard(runView: NonNullable<ReturnType<typeof buildAgentRunView>>): MiniCardData {
  const m = runView.miniCard;
  return {
    title: m.title || m.header,
    header: m.header,
    subtitle: m.subtitle,
    liveBriefings: m.liveBriefings.length > 0 ? m.liveBriefings : [m.subtitle || m.header],
    status: m.status,
    activity: m.activity ?? [],
    tasks: m.tasks,
    editedFile: m.editedFile,
    fileCount: m.fileCount,
    hasPlan: m.hasPlan,
    lastTool: m.lastTool ?? null,
  };
}

export function mapAssistantTurn(
  item: Extract<RawThreadItem, { kind: "assistant" }>,
  ctx: TurnContext,
): Extract<ThreadItem, { kind: "assistant" }> {
  const { thread, itemIndex, messages, running, activeRunId, sessionProgress, focusedRunId } = ctx;

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

  if (!resolved && runId && item.runId === activeRunId && (item.isActive || !!item.live)) {
    resolved = sessionProgress;
  }
  if (!resolved && item.runId) {
    resolved = resolveHistoricalRunProgress(item.runId, messages);
  }
  if (
    resolved &&
    item.runId &&
    item.runId === activeRunId &&
    sessionProgress.workingDurationMs != null &&
    sessionProgress.workingDurationMs > 0 &&
    (resolved.workingDurationMs == null || resolved.workingDurationMs <= 0)
  ) {
    resolved = { ...resolved, workingDurationMs: sessionProgress.workingDurationMs };
  }
  if (!resolved && item.message?.content?.trim()) {
    const meta = item.message.meta;
    const isFailure =
      (meta && typeof meta === "object" && meta.buildFailed === true) ||
      (meta && typeof meta === "object" && meta.lastFinishOk === false) ||
      item.message.content.trim().startsWith("Erro:");
    if (!isFailure) {
      resolved = {
        ...initialAgentProgress,
        finished: true,
        streamText: item.message.content.trim(),
        conversational: true,
      };
    }
  }

  const suppressLiveOverlay =
    !!focusedRunId && focusedRunId !== (item.runId ?? activeRunId);
  const anchoredLive =
    !!running &&
    !!activeRunId &&
    !!item.runId &&
    item.runId === activeRunId &&
    !!resolved &&
    !resolved.finished &&
    !resolved.canceled &&
    !suppressLiveOverlay;

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

  const effectiveAnchored = (item.isActive || anchoredLive) && !suppressLiveOverlay;
  let computedSlot = resolved
    ? hasActiveJob(resolved, { running: true, slotActive: effectiveAnchored })
    : effectiveAnchored;
  // Honra o marcador isActive do raw item (ex.: testes diretos ou live slots do builder) para
  // estados de "Pensando ativo".
  const slotActive = computedSlot || item.isActive || false;

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
        livePlan: ctx.pendingPlan && ctx.pendingPlan.runId === item.runId ? ctx.pendingPlan : null,
        progressPlan: resolved?.pendingPlan ?? null,
        assistantMessage: item.message,
      })
    : null;

  const isLiveTurn = (item.isActive || anchoredLive || (!!activeRunId && item.runId === activeRunId)) && !suppressLiveOverlay;
  const runStartedAtMs = isLiveTurn ? (ctx.activeRunStartedAtMs ?? null) : null;

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
        id: c.id,
        label: c.label,
        description: c.description,
      })),
    };
  }

  const rawStreamText = closingText ?? resolved?.streamText ?? null;
  let narration = resolveTurnNarration(resolved, runView, rawStreamText);
  let streamText = rawStreamText;
  if (
    !streamText &&
    resolved?.error?.trim() &&
    resolved.finished &&
    !slotActive &&
    resolved.lastFinishOk !== false
  ) {
    streamText = resolved.error.trim();
  }
  if (slotActive && showJobCard && streamText) streamText = null;

  const planDockActive =
    !!ctx.pendingPlan &&
    (resolved?.awaitingKind === "plan_approval" || item.runId === ctx.pendingPlan.runId);
  if (planDockActive) streamText = null;

  const syntheticLiveSlot =
    slotActive &&
    !item.message &&
    !!activeRunId &&
    item.runId === activeRunId &&
    !!(item.isActive || item.live);
  if (syntheticLiveSlot) {
    // Fechamento só após materializar no DB; intro (narração) e pensando seguem no live.
    streamText = null;
  }

  const { line: thinking, frozen: thinkingFrozen } = resolveTurnThinkingLine({
    resolved,
    slotActive,
    runStartedAtMs,
    narration,
    streamText,
    isClarifyOnly,
  });

  const canShowMiniCardLive = !slotActive || thinkingFrozen;
  const persistMiniCard =
    canShowMiniCardLive &&
    !!runView &&
    (showJobCard || (!!item.message && hasMaterializedCardSnapshot(item.message)));
  const miniCard = persistMiniCard && runView ? toMiniCard(runView) : null;

  const turn: Extract<ThreadItem, { kind: "assistant" }> = {
    kind: "assistant",
    message: item.message,
    runId,
    isActive: slotActive,
    streamText,
    phase: (resolved?.phase as RunPhase) ?? null,
    narration,
    miniCard,
    clarify,
    error: runView?.error ?? resolved?.error ?? null,
    finished: runView?.finished ?? resolved?.finished ?? false,
    lastFinishOk: runView?.lastFinishOk ?? resolved?.lastFinishOk ?? undefined,
    resumable: runView?.resumable ?? resolved?.resumable ?? false,
    isFocused: !!focusedRunId && focusedRunId === runId,
    thinking,
    runStartedAtMs,
  };

  return enforceAssistantTurnInvariant(turn);
}
