import type { AgentProgress } from "@/lib/agent-progress";
import type { AgentRunView } from "@/lib/forge-run";
import { hasFirstInspectorToken, resolveLatencyThinking } from "@/lib/forge-run";

export type TurnThinking = {
  active: boolean;
  startedAtMs?: number;
  durationMs?: number;
};

/** Thinking… no envio → Thought for Xs no 1º token → nunca some. */
export function resolveTurnThinking(
  resolved: AgentProgress | null,
  runView: AgentRunView | null,
  runStartedAtMs: number | null,
  slotActive: boolean,
): TurnThinking | null {
  const storedMs = resolved?.latencyThoughtMs;
  if (storedMs != null && storedMs > 0) {
    return {
      active: false,
      startedAtMs: runStartedAtMs ?? Date.now() - storedMs,
      durationMs: storedMs,
    };
  }

  if (!runStartedAtMs) {
    if (resolved && hasFirstInspectorToken(resolved)) {
      const first = resolved.timeline.find(
        (e) =>
          e.type === "assistant_text" &&
          typeof e.data?.text === "string" &&
          String(e.data.text).trim().length > 0,
      );
      const startedAt = first?.timestamp ?? Date.now();
      return {
        active: false,
        startedAtMs: startedAt,
        durationMs: Math.max(500, Date.now() - startedAt),
      };
    }
    if (slotActive) return { active: true };
    return null;
  }

  const latency =
    runView?.latencyThinking ??
    (resolved
      ? resolveLatencyThinking(resolved, slotActive, runStartedAtMs)
      : null);

  if (latency) {
    return {
      active: latency.active,
      startedAtMs: latency.startedAtMs ?? runStartedAtMs,
      durationMs: latency.durationMs,
    };
  }

  if (slotActive) {
    return { active: true, startedAtMs: runStartedAtMs };
  }

  return null;
}

/** Narração de abertura — entrou, nunca mais sai (mesmo com fechamento no stream). */
export function resolveTurnNarration(
  resolved: AgentProgress | null,
  runView: AgentRunView | null,
  _streamText: string | null,
): string | null {
  return resolved?.narrationText?.trim() || runView?.narration?.trim() || null;
}