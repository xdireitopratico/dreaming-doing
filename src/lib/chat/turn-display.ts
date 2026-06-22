import type { AgentProgress } from "@/lib/agent-progress";
import { buildForgeTimeline, type AgentRunView } from "@/lib/forge-run";
import { collapseNarrationBuffer } from "@/lib/narration-dedupe";
import type { ChatThoughtState, ChatWorkingState, MiniCardData } from "@/lib/chat/types";

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
  if (card.tasks.some((t) => t.status !== "pending")) return true;
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

/** Thought no chat — fonte: buildForgeTimeline (thinking_text / legado). */
export function resolveTurnThinking(
  resolved: AgentProgress | null,
  slotActive: boolean,
): ChatThoughtState | null {
  if (!resolved) return null;
  const timeline = resolved.timeline ?? [];
  if (timeline.length === 0) return null;

  const items = buildForgeTimeline(timeline, slotActive);
  const thought = items.find((i) => i.type === "THOUGHT");
  if (!thought || thought.type !== "THOUGHT") return null;

  const text = thought.text?.trim() || null;
  if (thought.active) {
    return { status: "active", text };
  }
  return {
    status: "done",
    durationSec: Math.max(1, Math.round(thought.durationMs / 1000)),
    text,
  };
}

/** Uma linha por turno: Pensando… → Pensou por Xs (congela uma vez). */
export function resolveChatWorking(opts: {
  slotActive: boolean;
  runStartedAtMs?: number | null;
  workingDurationMs?: number | null;
  hasVisibleContent: boolean;
}): ChatWorkingState | null {
  const { slotActive, runStartedAtMs, workingDurationMs, hasVisibleContent } = opts;

  if (workingDurationMs != null && workingDurationMs > 0) {
    return {
      status: "done",
      durationSec: Math.max(1, Math.round(workingDurationMs / 1000)),
    };
  }

  if (hasVisibleContent && runStartedAtMs) {
    const ms = Math.max(1000, Date.now() - runStartedAtMs);
    return { status: "done", durationSec: Math.max(1, Math.round(ms / 1000)) };
  }

  if (slotActive && runStartedAtMs) {
    return { status: "active" };
  }

  return null;
}