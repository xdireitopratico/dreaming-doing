import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProgress } from "@/lib/agent-progress";
import { buildForgeTimeline, resolveLatencyThinking } from "@/lib/forge-run";
import {
  buildInspectorDetailBlocks,
  lastThoughtBlockId,
  type InspectorDetailBlock,
} from "@/lib/inspector-details";
import { ForgeThinking } from "@/components/editor/ForgeThinking";

type InspectorDetailsProps = {
  progress: AgentProgress;
  running: boolean;
  onOpenFile?: (path: string) => void;
  runStartedAtMs?: number | null;
};

function ThoughtBlock({
  block,
  defaultOpen,
}: {
  block: Extract<InspectorDetailBlock, { kind: "thought" }>;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || !!block.active);
  const sec = Math.max(1, Math.round(block.durationMs / 1000));

  useEffect(() => {
    if (block.active) setOpen(true);
  }, [block.active, block.text]);

  return (
    <div className="forge-details-thought" data-testid="details-thought">
      <button
        type="button"
        className="forge-details-thought-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="forge-details-thought-label">Thought for {sec}s</span>
        {block.active && (
          <Loader2 className="size-3 animate-spin" style={{ color: "var(--text-accent)" }} />
        )}
        <ChevronDown
          className={cn(
            "forge-details-chevron size-3.5",
            open && "forge-details-chevron--open",
          )}
        />
      </button>
      {(open || block.active) && block.text && (
        <p className="forge-details-thought-body">{block.text}</p>
      )}
    </div>
  );
}

function ActionRow({
  block,
  onOpenFile,
}: {
  block: Extract<InspectorDetailBlock, { kind: "action" }>;
  onOpenFile?: (path: string) => void;
}) {
  const clickable = !!block.path && !!onOpenFile;
  return (
    <div className="forge-details-action" data-testid="details-action">
      {clickable ? (
        <button type="button" className="forge-details-action-btn" onClick={() => onOpenFile!(block.path!)}>
          {block.label}
        </button>
      ) : (
        <span className="forge-details-action-label">{block.label}</span>
      )}
    </div>
  );
}

function CodeBlock({ block }: { block: Extract<InspectorDetailBlock, { kind: "code" }> }) {
  return (
    <pre className="forge-details-code" data-testid="details-code">
      <code>{block.code}</code>
    </pre>
  );
}

function SectionBlock({ block }: { block: Extract<InspectorDetailBlock, { kind: "section" }> }) {
  return (
    <div className="forge-details-section" data-testid="details-section">
      <p className="forge-details-section-title">{block.title}</p>
      {block.body && <p className="forge-details-section-body">{block.body}</p>}
    </div>
  );
}

export function InspectorDetails({
  progress,
  running,
  onOpenFile,
  runStartedAtMs,
}: InspectorDetailsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineItems = useMemo(
    () => buildForgeTimeline(progress.timeline, running),
    [progress.timeline, running],
  );
  const blocks = useMemo(() => buildInspectorDetailBlocks(timelineItems), [timelineItems]);
  const lastThoughtId = useMemo(() => lastThoughtBlockId(blocks), [blocks]);

  const latencyThinking = useMemo(
    () => resolveLatencyThinking(progress, running, runStartedAtMs, timelineItems),
    [progress, running, runStartedAtMs, timelineItems],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !running) return;
    el.scrollTop = el.scrollHeight;
  }, [blocks.length, latencyThinking, running]);

  if (!blocks.length && !latencyThinking && !running) {
    return (
      <p className="forge-inspector-empty" data-testid="inspector-details-empty">
        Aguardando atividade do agente…
      </p>
    );
  }

  return (
    <div className="forge-inspector-details" data-testid="inspector-details">
      <div ref={scrollRef} className="forge-inspector-details-scroll">
        {latencyThinking && (
          <div className="forge-inspector-latency-thinking" data-testid="inspector-latency-thinking">
            <ForgeThinking variant="latency" startedAtMs={latencyThinking.startedAtMs} active />
          </div>
        )}

        {blocks.map((block) => {
          switch (block.kind) {
            case "thought":
              return (
                <ThoughtBlock
                  key={block.id}
                  block={block}
                  defaultOpen={block.id === lastThoughtId}
                />
              );
            case "action":
              return <ActionRow key={block.id} block={block} onOpenFile={onOpenFile} />;
            case "code":
              return <CodeBlock key={block.id} block={block} />;
            case "section":
              return <SectionBlock key={block.id} block={block} />;
            default:
              return null;
          }
        })}
      </div>

      {running && (
        <footer className="forge-inspector-details-footer" data-testid="inspector-thinking-footer">
          <span className="forge-inspector-details-footer-dot" aria-hidden />
          Thinking…
        </footer>
      )}
    </div>
  );
}