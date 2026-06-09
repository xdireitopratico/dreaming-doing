import { useEffect, useMemo, useRef } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { JobWorkspaceTab } from "@/hooks/useJobWorkspaceFocus";
import { JobWorkspaceHeader } from "@/components/editor/JobWorkspaceHeader";
import { ChatDiffViewer } from "@/components/editor/ChatDiffViewer";
import {
  buildJobStream,
  deriveInspectorView,
} from "@/lib/agent-job-stream";

type JobWorkspacePanelProps = {
  progress: AgentProgress;
  runId: string;
  running: boolean;
  activeTab: JobWorkspaceTab;
  onTabChange: (tab: JobWorkspaceTab) => void;
  onBackToLatest: () => void;
};

function DetailsTab({ progress, running }: { progress: AgentProgress; running: boolean }) {
  const atoms = useMemo(
    () => buildJobStream(progress.timeline, { running }),
    [progress.timeline, running],
  );
  const { thoughts, errors } = useMemo(() => deriveInspectorView(atoms), [atoms]);

  return (
    <div className="lovable-job-details" data-testid="job-tab-details">
      {errors.map((err) => (
        <section
          key={err.id}
          className="my-2 rounded-lg border border-red-400/35 bg-red-400/8 px-3 py-2.5"
          data-testid="job-build-error"
        >
          <p className="text-[12px] font-medium text-red-300">{err.label}</p>
          {err.detail && (
            <p className="mt-1 font-mono text-[10px] text-[var(--forge-silver)] whitespace-pre-wrap">
              {err.detail}
            </p>
          )}
        </section>
      ))}

      {thoughts.map((block) => (
        <section key={block.id} className="lovable-job-thought-block">
          <p className="lovable-job-thought-label">Thought for {block.thoughtSec}s</p>
          {block.lines.map((line, i) => (
            <p key={`${block.id}-${i}`} className="lovable-job-thought-text">
              {line}
            </p>
          ))}
        </section>
      ))}

      {!thoughts.length && !errors.length && (
        <p className="lovable-job-empty">Aguardando atividade do agente…</p>
      )}
    </div>
  );
}

function TimelineTab({ progress, running }: { progress: AgentProgress; running: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atoms = useMemo(
    () => buildJobStream(progress.timeline, { running }),
    [progress.timeline, running],
  );
  const { log } = useMemo(() => deriveInspectorView(atoms), [atoms]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !running) return;
    el.scrollTop = el.scrollHeight;
  }, [log.length, running]);

  return (
    <div className="lovable-job-timeline" ref={scrollRef} data-testid="job-tab-timeline">
      {log.length > 0 ? (
        <ul className="lovable-job-log">
          {log.map((entry) => (
            <li key={entry.id} className="lovable-job-log-item">
              <FileText className="size-3.5 shrink-0 opacity-60" />
              <div className="min-w-0 flex-1">
                <p className="lovable-job-log-label">
                  {entry.status === "active" && (
                    <Loader2 className="inline size-3 mr-1 animate-spin" />
                  )}
                  {entry.label}
                </p>
                {entry.detail && (
                  <p className="lovable-job-log-detail truncate">{entry.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lovable-job-empty">Nenhum evento ainda.</p>
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
      {diffs.length > 0 && <ChatDiffViewer diffs={diffs} />}
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

        {activeTab === "details" && <DetailsTab progress={progress} running={running} />}
        {activeTab === "timeline" && <TimelineTab progress={progress} running={running} />}
        {activeTab === "changes" && <ChangesTab progress={progress} />}
      </div>
    </div>
  );
}