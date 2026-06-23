import type { AgentProgress } from "@/lib/agent-progress";
import { buildForgeTimeline, type AgentRunView } from "@/lib/forge-run";
import { collapseNarrationBuffer } from "@/lib/narration-dedupe";
import type { ChatThinkingState, MiniCardData } from "@/lib/chat/types";

export function resolveTurnNarration(
  resolved: AgentProgress | null,
  _runView: AgentRunView | null,
  _streamText: string | null,
): string | null {
  const raw = resolved?.narrationText?.trim() || null;
  if (!raw) return null;
  const collapsed = collapseNarrationBuffer(raw).trim();
  return collapsed || null;
}

/** Conteúdo que o usuário já vê no turno do chat (não inclui raciocínio interno). */
export function hasTurnVisibleContent(progress: AgentProgress): boolean {
  if (progress.narrationText?.trim()) return true;
  if (progress.streamText?.trim()) return true;
  if ((progress.tools?.length ?? 0) > 0) return true;
  if ((progress.diffs?.length ?? 0) > 0) return true;
  return false;
}

export function miniCardShowsInChat(card: MiniCardData | null | undefined): boolean {
  if (!card) return false;
  if (card.editedFile) return true;
  if ((card.fileCount ?? 0) > 0) return true;
  if (card.activity && card.activity.some((a) => a.status === "active" || a.status === "done")) return true;
  if (card.header.trim() && card.header !== "Working") return true;
  return false;
}

export function hasRenderedTurnContent(opts: {
  narration?: string | null;
  streamText?: string | null;
  miniCard?: MiniCardData | null;
}): boolean {
  if (opts.narration?.trim()) return true;
  if (opts.streamText?.trim()) return true;
  if (miniCardShowsInChat(opts.miniCard)) return true;
  return false;
}

function hasThinkingTimeline(resolved: AgentProgress | null): boolean {
  if (!resolved?.timeline?.length) return false;
  if (resolved.timeline.some((ev) => ev.type === "thinking_text")) return true;
  return resolved.timeline.some(
    (ev) => ev.type === "assistant_text" && (ev.data as Record<string, unknown>)?.thinking === true,
  );
}

function resolveThinkingDurationSec(opts: {
  workingDurationMs?: number | null;
  resolved: AgentProgress | null;
  slotActive: boolean;
  runStartedAtMs?: number | null;
}): number {
  if (opts.workingDurationMs != null && opts.workingDurationMs > 0) {
    return Math.max(1, Math.round(opts.workingDurationMs / 1000));
  }
  if (opts.slotActive && opts.runStartedAtMs) {
    return Math.max(1, Math.round((Date.now() - opts.runStartedAtMs) / 1000));
  }
  if (opts.resolved?.timeline?.length) {
    const items = buildForgeTimeline(opts.resolved.timeline, false);
    const thought = items.find((i) => i.type === "THOUGHT");
    if (thought?.type === "THOUGHT" && thought.durationMs > 0) {
      return Math.max(1, Math.round(thought.durationMs / 1000));
    }
  }
  return 1;
}

/** Congela «Pensando…» → «Pensou por Xs» — mesmos gatilhos em Chat/Plan/Build. */
export function shouldFreezeThinkingLine(opts: {
  resolved: AgentProgress | null;
  narration?: string | null;
  streamText?: string | null;
}): boolean {
  const { resolved, narration, streamText } = opts;
  if (resolved?.workingDurationMs != null && resolved.workingDurationMs > 0) return true;
  if (resolved?.finished) return true;
  if (narration?.trim()) return true;
  if (streamText?.trim() && resolved?.conversational) return true;
  if ((resolved?.tools?.length ?? 0) > 0) return true;
  if ((resolved?.diffs?.length ?? 0) > 0) return true;
  if ((resolved?.deliveryFiles?.length ?? 0) > 0) return true;
  return false;
}

/**
 * Uma linha por turno — só estado (Pensando… / Pensou por Xs).
 * Texto do raciocínio fica no inspector (privateThoughtText / timeline).
 */
export function resolveTurnThinkingLine(opts: {
  resolved: AgentProgress | null;
  slotActive: boolean;
  runStartedAtMs?: number | null;
  narration?: string | null;
  streamText?: string | null;
  isClarifyOnly?: boolean;
}): { line: ChatThinkingState | null; frozen: boolean } {
  const { resolved, slotActive, runStartedAtMs, narration, streamText, isClarifyOnly } = opts;

  if (isClarifyOnly) return { line: null, frozen: false };

  const frozen = shouldFreezeThinkingLine({ resolved, narration, streamText });
  const hasDuration =
    resolved?.workingDurationMs != null && resolved.workingDurationMs > 0;
  const conversational = resolved?.conversational === true;

  const shouldShow =
    slotActive ||
    hasDuration ||
    (conversational && (slotActive || frozen)) ||
    (!conversational &&
      (hasThinkingTimeline(resolved) ||
        frozen ||
        (!!resolved?.finished && hasTurnVisibleContent(resolved))));

  if (!shouldShow) return { line: null, frozen };

  if (frozen) {
    return {
      line: {
        status: "done",
        durationSec: resolveThinkingDurationSec({
          workingDurationMs: resolved?.workingDurationMs,
          resolved,
          slotActive,
          runStartedAtMs,
        }),
      },
      frozen: true,
    };
  }

  if (slotActive) {
    return { line: { status: "active" }, frozen: false };
  }

  return { line: null, frozen: false };
}