import type { AgentProgress } from "@/lib/agent-progress";
import type { AgentRunView } from "@/lib/forge-run";
import { buildForgeTimeline, resolveLatencyThinking } from "@/lib/forge-run";

export type TurnThinking = {
  active: boolean;
  startedAtMs?: number;
  durationMs?: number;
};

/** Thought for Xs — congela e permanece (referência Lovable img 5/9). */
export function resolveTurnThinking(
  resolved: AgentProgress | null,
  runView: AgentRunView | null,
  runStartedAtMs: number | null,
  slotActive: boolean,
): TurnThinking | null {
  const latency = runView?.latencyThinking;
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

  if (!resolved) return null;

  const forgeTimeline = buildForgeTimeline(resolved.timeline, slotActive);
  const frozenLatency = resolveLatencyThinking(
    resolved,
    slotActive,
    runStartedAtMs,
    forgeTimeline,
  );

  if (frozenLatency) {
    return {
      active: frozenLatency.active,
      startedAtMs: frozenLatency.startedAtMs,
      durationMs:
        frozenLatency.durationMs ??
        (frozenLatency.startedAtMs
          ? Math.max(500, Date.now() - frozenLatency.startedAtMs)
          : undefined),
    };
  }

  const thoughtItems = forgeTimeline.filter((i) => i.type === "THOUGHT");
  const lastThought = thoughtItems[thoughtItems.length - 1];
  if (lastThought?.type === "THOUGHT" && lastThought.durationMs > 0) {
    return {
      active: !!lastThought.active,
      durationMs: lastThought.durationMs,
    };
  }

  return null;
}

/** Narração PT solta acima do card — permanece após resposta (img 5). */
export function resolveTurnNarration(
  resolved: AgentProgress | null,
  runView: AgentRunView | null,
  streamText: string | null,
): string | null {
  const narration =
    runView?.narration?.trim() || resolved?.narrationText?.trim() || null;
  if (!narration) return null;

  const stream = streamText?.trim() || null;
  if (!stream) return narration;
  if (stream === narration) return null;
  if (stream.includes(narration)) return null;

  return narration;
}