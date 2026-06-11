import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import { buildForgeTimeline, resolveLatencyThinking } from "@/lib/forge-run";
import { ForgeThinking } from "@/components/editor/ForgeThinking";
import { TimelineItem } from "@/components/editor/TimelineItem";

type InspectorTimelineProps = {
  progress: AgentProgress;
  running: boolean;
  onOpenFile?: (path: string) => void;
  /** Início do turno — Think latency até o 1º token thinking:true do SSE. */
  runStartedAtMs?: number | null;
};

export function InspectorTimeline({
  progress,
  running,
  onOpenFile,
  runStartedAtMs,
}: InspectorTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => buildForgeTimeline(progress.timeline, running),
    [progress.timeline, running],
  );

  const latencyThinking = useMemo(
    () => resolveLatencyThinking(progress, running, runStartedAtMs, items),
    [progress, running, runStartedAtMs, items],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !running) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length, latencyThinking, running]);

  if (!items.length && !latencyThinking) {
    return (
      <p className="forge-inspector-empty" data-testid="inspector-timeline-empty">
        Aguardando atividade do agente…
      </p>
    );
  }

  return (
    <div ref={scrollRef} className="forge-inspector-timeline" data-testid="inspector-timeline">
      {latencyThinking && (
        <div className="forge-inspector-latency-thinking" data-testid="inspector-latency-thinking">
          <ForgeThinking variant="latency" startedAtMs={latencyThinking.startedAtMs} active />
        </div>
      )}
      {items.map((item) => (
        <TimelineItem key={item.id} item={item} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}
