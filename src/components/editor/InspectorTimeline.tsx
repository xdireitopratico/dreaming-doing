import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import { buildForgeTimeline } from "@/lib/forge-run";
import { TimelineItem } from "@/components/editor/TimelineItem";

type InspectorTimelineProps = {
  progress: AgentProgress;
  running: boolean;
  onOpenFile?: (path: string) => void;
};

export function InspectorTimeline({ progress, running, onOpenFile }: InspectorTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => buildForgeTimeline(progress.timeline, running),
    [progress.timeline, running],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !running) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length, running]);

  if (!items.length) {
    return (
      <p className="forge-inspector-empty" data-testid="inspector-timeline-empty">
        Aguardando atividade do agente…
      </p>
    );
  }

  return (
    <div ref={scrollRef} className="forge-inspector-timeline" data-testid="inspector-timeline">
      {items.map((item) => (
        <TimelineItem key={item.id} item={item} onOpenFile={onOpenFile} />
      ))}
    </div>
  );
}