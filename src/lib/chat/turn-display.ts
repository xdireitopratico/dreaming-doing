import type { AgentProgress } from "@/lib/agent-progress";
import type { AgentRunView } from "@/lib/forge-run";
import { resolveLatencyThinking } from "@/lib/forge-run";
import { collapseNarrationBuffer } from "@/lib/narration-dedupe";

export type TurnThinking = {
  active: boolean;
  startedAtMs?: number;
  durationMs?: number;
  connectionState?: "connected" | "reconnecting" | "disconnected";
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
    const hasThinkingEvidence = resolved?.timeline.some(
      (e) => e.type === "assistant_text" && e.data?.thinking === true,
    );
    if (resolved && hasThinkingEvidence) {
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
      connectionState: resolved?.connectionState,
    };
  }

  if (slotActive) {
    return { active: true, startedAtMs: runStartedAtMs };
  }

  const hasThinkingEvidence2 = resolved?.timeline.some(
    (e) => e.type === "assistant_text" && e.data?.thinking === true,
  );
  if (resolved && hasThinkingEvidence2) {
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

  return null;
}

/** Narração de abertura — entrou, nunca mais sai (mesmo com fechamento no stream). */
export function resolveTurnNarration(
  resolved: AgentProgress | null,
  runView: AgentRunView | null,
  _streamText: string | null,
): string | null {
  const raw = resolved?.narrationText?.trim() || runView?.narration?.trim() || null;
  if (!raw) return null;
  const collapsed = collapseNarrationBuffer(raw).trim();
  return collapsed || null;
}