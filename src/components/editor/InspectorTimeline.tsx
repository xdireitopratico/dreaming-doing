import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import { buildForgeTimeline, resolveLatencyThinking } from "@/lib/forge-run";
import { ForgeThinking } from "@/components/editor/ForgeThinking";
import { InspectorActivityFeed } from "@/components/editor/InspectorActivityFeed";

type InspectorTimelineProps = {
  progress: AgentProgress;
  running: boolean;
  onOpenFile?: (path: string) => void;
  runStartedAtMs?: number | null;
};

/** Timeline Lovable — labels humanos (Read/Edited/Searching) + thoughts colapsáveis. */
export function InspectorTimeline({
  progress,
  running,
  onOpenFile,
  runStartedAtMs,
}: InspectorTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineItems = useMemo(
    () => buildForgeTimeline(progress.timeline, running),
    [progress.timeline, running],
  );

  const latencyThinking = useMemo(
    () => resolveLatencyThinking(progress, running, runStartedAtMs, timelineItems),
    [progress, running, runStartedAtMs, timelineItems],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !running) return;
    el.scrollTop = el.scrollHeight;
  }, [timelineItems.length, latencyThinking, running]);

  if (!timelineItems.length && !latencyThinking && !running) {
    return (
      <p className="forge-inspector-empty" data-testid="inspector-timeline-empty">
        Aguardando atividade do agente…
      </p>
    );
  }

  return (
    <div className="forge-inspector-details" data-testid="inspector-timeline">
      <div ref={scrollRef} className="forge-inspector-details-scroll">
        {latencyThinking && (
          <div className="forge-inspector-latency-thinking" data-testid="inspector-latency-thinking">
            <ForgeThinking
              variant="latency"
              startedAtMs={latencyThinking.startedAtMs}
              durationMs={latencyThinking.durationMs}
              active={latencyThinking.active}
            />
          </div>
        )}
        <InspectorActivityFeed items={timelineItems} onOpenFile={onOpenFile} running={running} />
      </div>
      {running && latencyThinking?.active && (
        <footer className="forge-inspector-details-footer" data-testid="inspector-thinking-footer">
          <span className="forge-inspector-details-footer-dot" aria-hidden />
          Thinking…
        </footer>
      )}
    </div>
  );
}