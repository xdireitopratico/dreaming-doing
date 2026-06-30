import { useCallback, useEffect, useMemo, useRef } from "react";
import { buildForgeTimeline } from "@/lib/timeline-builder";
import type { AgentProgress } from "@/lib/agent-progress";
import { hasInspectorProgressContent } from "@/lib/assistant-run-progress";
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
}: InspectorTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const timelineItems = useMemo(
    () => buildForgeTimeline(progress.timeline, running),
    [progress.timeline, running],
  );

  const liveThinkingPreview = useMemo(() => {
    if (!running) return "";
    if (timelineItems.some((item) => item.type === "THOUGHT")) return "";
    return progress.timeline
      .filter(
        (ev) =>
          ev.type === "assistant_text" && (ev.data as Record<string, unknown>)?.thinking === true,
      )
      .map((ev) => String((ev.data as Record<string, unknown>)?.text ?? ""))
      .join("");
  }, [progress.timeline, running, timelineItems]);

  const showThinkingHeader = running && timelineItems.length === 0;

  const handleUserScroll = useCallback(() => {
    userScrolledRef.current = true;
  }, []);

  useEffect(() => {
    const el =
      scrollRef.current?.closest<HTMLElement>(".forge-inspector-body") ?? scrollRef.current;
    if (!el || !running) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 100 && !userScrolledRef.current) {
      // Direto (instantâneo): smooth disparado a cada novo evento anima pra um alvo que cresce a cada frame → treme-treme.
      el.scrollTop = el.scrollHeight;
    }
  }, [timelineItems.length, running]);

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
            <span>Pensando…</span>
          </div>
        )}
        {liveThinkingPreview.trim() && (
          <div className="forge-details-thought" data-testid="inspector-live-thinking">
            <div className="forge-details-thought-header">
              <span className="forge-details-thought-label">Pensando…</span>
            </div>
            <p className="forge-details-thought-body">{liveThinkingPreview.trim()}</p>
          </div>
        )}
        <InspectorActivityFeed
          items={timelineItems}
          plan={progress.pendingPlan}
          onOpenFile={onOpenFile}
          running={running}
        />
      </div>
    </div>
  );
}
