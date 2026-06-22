import { useCallback, useEffect, useMemo, useRef } from "react";
import { buildTimeline, resolveLatencyThinking } from "@/lib/timeline-builder";
import type { AgentProgress } from "@/lib/agent-progress";
import type { TimelineEntry } from "@/lib/timeline-builder";
import { hasInspectorProgressContent } from "@/lib/assistant-run-progress";
import { ForgeThinking } from "@/components/editor/ForgeThinking";
import { InspectorActivityFeed } from "@/components/editor/InspectorActivityFeed";

type InspectorTimelineProps = {
  progress: AgentProgress;
  running: boolean;
  onOpenFile?: (path: string) => void;
  runStartedAtMs?: number | null;
};

export function InspectorTimeline({
  progress,
  running,
  onOpenFile,
  runStartedAtMs,
}: InspectorTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const timelineItems = useMemo(
    () => buildTimeline(progress.timeline, running),
    [progress.timeline, running],
  );

  const latencyThinking = useMemo(
    () => resolveLatencyThinking(progress, running, runStartedAtMs),
    [progress, running, runStartedAtMs],
  );

  const hasActiveThought = timelineItems.some((item) => item.kind === "thought" && item.active);
  const showThinkingHeader =
    running && (latencyThinking?.active || hasActiveThought || timelineItems.length === 0);

  const handleUserScroll = useCallback(() => {
    userScrolledRef.current = true;
  }, []);

  useEffect(() => {
    const el =
      scrollRef.current?.closest<HTMLElement>(".forge-inspector-body") ?? scrollRef.current;
    if (!el || !running) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 100 && !userScrolledRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [timelineItems.length, running, latencyThinking]);

  useEffect(() => {
    userScrolledRef.current = false;
  }, [timelineItems.length]);

  const hasInspectorContent = hasInspectorProgressContent(progress);
  if (!timelineItems.length && !running && !hasInspectorContent) {
    return (
      <p className="forge-inspector-empty" data-testid="inspector-timeline-empty">
        Aguardando atividade do agente…
      </p>
    );
  }

  return (
    <div className="forge-inspector-details" data-testid="inspector-timeline">
      <div ref={scrollRef} className="forge-inspector-details-scroll" onScroll={handleUserScroll}>
        {showThinkingHeader && (
          <div className="forge-inspector-thinking-header" data-testid="inspector-thinking-header">
            <span className="forge-inspector-thinking-dot" aria-hidden />
            {latencyThinking?.active && latencyThinking.startedAtMs ? (
              <ForgeThinking
                variant="latency"
                startedAtMs={latencyThinking.startedAtMs}
                durationMs={latencyThinking.durationMs}
                active
              />
            ) : (
              <span>Pensando…</span>
            )}
          </div>
        )}
        <InspectorActivityFeed items={timelineItems} onOpenFile={onOpenFile} running={running} />
      </div>
    </div>
  );
}
