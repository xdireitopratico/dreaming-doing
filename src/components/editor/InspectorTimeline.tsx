import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import {
  buildForgeTimeline,
  resolveLatencyThinking,
  type ForgeTimelineItem,
} from "@/lib/forge-run";
import { hasInspectorProgressContent } from "@/lib/assistant-run-progress";
import { ForgeThinking } from "@/components/editor/ForgeThinking";
import { InspectorActivityFeed } from "@/components/editor/InspectorActivityFeed";

function toolPathFromArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  const path = args.path ?? args.filePath ?? args.file;
  return typeof path === "string" && path.trim() ? path : undefined;
}

function timelineItemsFromTools(tools: AgentProgress["tools"]): ForgeTimelineItem[] {
  return tools.map((tool, index) => ({
    type: "TOOL",
    id: `tool-snap-${index}`,
    name: tool.name,
    path: toolPathFromArgs(tool.args),
    detail: toolPathFromArgs(tool.args) ? undefined : JSON.stringify(tool.args ?? {}).slice(0, 200),
  }));
}

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
  const timelineItems = useMemo(() => {
    const built = buildForgeTimeline(progress.timeline, running);
    if (built.length > 0) return built;
    if (!running && (progress.tools?.length ?? 0) > 0) {
      return timelineItemsFromTools(progress.tools);
    }
    return built;
  }, [progress.timeline, progress.tools, running]);

  const latencyThinking = useMemo(
    () => resolveLatencyThinking(progress, running, runStartedAtMs, timelineItems),
    [progress, running, runStartedAtMs, timelineItems],
  );

  const hasActiveThought = timelineItems.some(
    (item) => item.type === "THOUGHT" && item.active,
  );
  const showThinkingFooter =
    running && (latencyThinking?.active || hasActiveThought || timelineItems.length === 0);

  useEffect(() => {
    const el =
      scrollRef.current?.closest<HTMLElement>(".forge-inspector-body") ?? scrollRef.current;
    if (!el || !running) return;
    el.scrollTop = el.scrollHeight;
  }, [timelineItems.length, latencyThinking, running, progress.timeline.length]);

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
      <div ref={scrollRef} className="forge-inspector-details-scroll">
        <InspectorActivityFeed items={timelineItems} onOpenFile={onOpenFile} running={running} />
      </div>
      {showThinkingFooter && (
        <footer className="forge-inspector-details-footer" data-testid="inspector-thinking-footer">
          <span className="forge-inspector-details-footer-dot" aria-hidden />
          {latencyThinking?.active && latencyThinking.startedAtMs ? (
            <ForgeThinking
              variant="latency"
              startedAtMs={latencyThinking.startedAtMs}
              durationMs={latencyThinking.durationMs}
              active
            />
          ) : (
            <span>Thinking…</span>
          )}
        </footer>
      )}
    </div>
  );
}