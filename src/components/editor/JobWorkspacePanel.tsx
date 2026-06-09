import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { JobWorkspaceTab } from "@/hooks/useJobWorkspaceFocus";
import { JobWorkspaceHeader } from "@/components/editor/JobWorkspaceHeader";
import { ChatDiffViewer } from "@/components/editor/ChatDiffViewer";
import { JobInlineTimeline } from "@/components/editor/JobInlineTimeline";
import {
  buildJobStreamTree,
  deriveInspectorView,
} from "@/lib/agent-job-stream";

type JobWorkspacePanelProps = {
  progress: AgentProgress;
  runId: string;
  running: boolean;
  activeTab: JobWorkspaceTab;
  onTabChange: (tab: JobWorkspaceTab) => void;
  onBackToLatest: () => void;
  onOpenFile?: (path: string) => void;
};

function TimelineTab({
  progress,
  running,
  onOpenFile,
}: {
  progress: AgentProgress;
  running: boolean;
  onOpenFile?: (path: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nodes = useMemo(
    () => buildJobStreamTree(progress.timeline, { running }),
    [progress.timeline, running],
  );
  const { errors } = useMemo(() => deriveInspectorView(nodes), [nodes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !running) return;
    el.scrollTop = el.scrollHeight;
  }, [nodes.length, running]);

  return (
    <div className="lovable-job-timeline" ref={scrollRef} data-testid="job-tab-timeline">
      {errors.map((err) => (
        <section
          key={err.id}
          className="my-2 rounded-lg border border-red-400/35 bg-red-400/8 px-3 py-2.5"
          data-testid="job-build-error"
        >
          <p className="text-[12px] font-medium text-red-300">
            {err.kind === "result" ? err.summary : "Erro no passo"}
          </p>
          {err.kind === "result" && err.evidence[0] && (
            <p className="mt-1 font-mono text-[10px] text-[var(--forge-silver)] whitespace-pre-wrap">
              {err.evidence[0]}
            </p>
          )}
        </section>
      ))}

      {nodes.length > 0 ? (
        <JobInlineTimeline nodes={nodes} variant="full" onOpenFile={onOpenFile} />
      ) : (
        <p className="lovable-job-empty">Aguardando atividade do agente…</p>
      )}
    </div>
  );
}

function ChangesTab({ progress }: { progress: AgentProgress }) {
  const diffs = progress.diffs;
  const delivered = progress.deliveryFiles ?? [];

  if (!diffs.length && !delivered.length) {
    return <p className="lovable-job-empty">Nenhuma alteração registrada ainda.</p>;
  }

  return (
    <div className="lovable-job-changes" data-testid="job-tab-changes">
      {delivered.length > 0 && (
        <section className="mb-4">
          <p className="lovable-job-section-label">Arquivos entregues</p>
          <ul className="lovable-job-delivered-list">
            {delivered.map((p) => (
              <li key={p} className="font-mono text-[11px] text-[var(--forge-silver)]">
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}
      {diffs.length > 0 && <ChatDiffViewer diffs={diffs} variant="inspector" />}
    </div>
  );
}

export function JobWorkspacePanel({
  progress,
  runId,
  running,
  activeTab,
  onTabChange,
  onBackToLatest,
  onOpenFile,
}: JobWorkspacePanelProps) {
  return (
    <div className="lovable-job-workspace flex min-h-0 h-full w-full flex-col" data-testid="job-workspace-panel">
      <JobWorkspaceHeader
        activeTab={activeTab}
        onTabChange={onTabChange}
        onBackToLatest={onBackToLatest}
      />

      <div className="lovable-job-workspace-body min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="lovable-job-run-id font-mono text-[9px] text-[var(--forge-ghost)] mb-3">
          Run {runId.slice(0, 8)}…
        </p>

        {activeTab === "timeline" && (
          <TimelineTab progress={progress} running={running} onOpenFile={onOpenFile} />
        )}
        {activeTab === "changes" && <ChangesTab progress={progress} />}
      </div>
    </div>
  );
}