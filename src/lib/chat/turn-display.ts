import type { AgentProgress } from "@/lib/agent-progress";
import type { AgentRunView } from "@/lib/forge-run";
import { buildForgeTimeline, resolveLatencyThinking } from "@/lib/forge-run";

export type TurnThinking = {
  active: boolean;
  startedAtMs?: number;
  durationMs?: number;
};

/** Thought for Xs — aparece no envio, congela no 1º token, nunca some. */
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

  const latency =
    runView?.latencyThinking ??
    (resolved && runStartedAtMs
      ? resolveLatencyThinking(
          resolved,
          slotActive,
          runStartedAtMs,
          buildForgeTimeline(resolved.timeline, slotActive),
        )
      : null);
  const reasoning = runView?.reasoningThought;

  if (latency || reasoning) {
    const durationMs =
      latency?.durationMs ??
      reasoning?.durationMs ??
      (latency?.startedAtMs && latency.active
        ? Math.max(500, Date.now() - latency.startedAtMs)
        : undefined);

    return {
      active: !!(latency?.active || reasoning?.active),
      startedAtMs: latency?.startedAtMs,
      durationMs,
    };
  }

  if (!resolved) {
    if (slotActive && runStartedAtMs) {
      return { active: true, startedAtMs: runStartedAtMs };
    }
    return null;
  }

  const forgeTimeline = buildForgeTimeline(resolved.timeline, slotActive);
  const thoughtItems = forgeTimeline.filter((i) => i.type === "THOUGHT");
  const lastThought = thoughtItems[thoughtItems.length - 1];
  if (lastThought?.type === "THOUGHT" && lastThought.durationMs > 0) {
    return {
      active: !!lastThought.active,
      durationMs: lastThought.durationMs,
    };
  }

  if (slotActive && runStartedAtMs) {
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