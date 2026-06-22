import type { AgentProgress } from "@/lib/agent-progress";
import type { AgentRunView } from "@/lib/forge-run";
import { collapseNarrationBuffer } from "@/lib/narration-dedupe";
import type { TurnThinkingState } from "@/lib/chat/types";

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

/** Mapeia thinking do run view para o bloco Thought do chat. */
export function resolveTurnThinking(
  runView: Pick<AgentRunView, "thinking"> | null,
  opts: { slotActive: boolean; runStartedAtMs?: number | null },
): TurnThinkingState | null {
  const t = runView?.thinking;

  if (t) {
    const isLatency = !t.text?.trim();
    if (t.active && isLatency && opts.runStartedAtMs) {
      return { variant: "latency", active: true, startedAtMs: opts.runStartedAtMs };
    }
    if (t.durationMs > 0) {
      return {
        variant: isLatency ? "latency" : "reasoning",
        active: t.active,
        durationMs: t.durationMs,
        startedAtMs: opts.runStartedAtMs ?? undefined,
      };
    }
  }

  if (opts.slotActive && opts.runStartedAtMs) {
    return { variant: "latency", active: true, startedAtMs: opts.runStartedAtMs };
  }

  return null;
}