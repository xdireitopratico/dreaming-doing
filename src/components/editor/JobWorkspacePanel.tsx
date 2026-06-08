import { useEffect, useMemo, useRef } from "react";
import { FileText, Loader2 } from "lucide-react";
import type { AgentProgress } from "@/lib/agent-progress";
import type { SSEEvent } from "@/lib/agent-progress";
import type { JobWorkspaceTab } from "@/hooks/useJobWorkspaceFocus";
import { JobWorkspaceHeader } from "@/components/editor/JobWorkspaceHeader";
import { AgentTimeline } from "@/components/editor/AgentTimeline";
import { ChatDiffViewer } from "@/components/editor/ChatDiffViewer";

type JobWorkspacePanelProps = {
  progress: AgentProgress;
  runId: string;
  running: boolean;
  activeTab: JobWorkspaceTab;
  onTabChange: (tab: JobWorkspaceTab) => void;
  onBackToLatest: () => void;
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

type ThoughtBlock = {
  id: string;
  thoughtSec: number;
  lines: string[];
};

function buildThoughtBlocks(timeline: SSEEvent[]): ThoughtBlock[] {
  const blocks: ThoughtBlock[] = [];
  let burstStart: number | null = null;
  let burstLines: string[] = [];

  const flush = (endTs: number) => {
    if (!burstLines.length || burstStart == null) return;
    const thoughtSec = Math.max(1, Math.round((endTs - burstStart) / 1000));
    blocks.push({
      id: `thought-${burstStart}`,
      thoughtSec,
      lines: [...burstLines],
    });
    burstLines = [];
    burstStart = null;
  };

  for (const ev of timeline) {
    const ts = ev.timestamp ?? Date.now();
    const data = ev.data ?? {};

    if (ev.type === "assistant_text" && typeof data.text === "string") {
      if (burstStart == null) burstStart = ts;
      burstLines.push(data.text.trim());
      continue;
    }

    if (ev.type === "phase" && typeof data.message === "string") {
      if (burstStart == null) burstStart = ts;
      burstLines.push(String(data.message));
      continue;
    }

    if (burstLines.length) flush(ts);
  }

  if (burstLines.length && burstStart != null) {
    blocks.push({
      id: `thought-${burstStart}`,
      thoughtSec: Math.max(1, Math.round((Date.now() - burstStart) / 1000)),
      lines: burstLines,
    });
  }

  return blocks;
}

type TimelineLogEntry = {
  id: string;
  label: string;
  detail?: string;
  active?: boolean;
};

function buildLovableLog(timeline: SSEEvent[], running: boolean): TimelineLogEntry[] {
  const entries: TimelineLogEntry[] = [];

  for (const ev of timeline) {
    const data = ev.data ?? {};
    if (ev.type === "tool_start") {
      const name = String(data.name ?? "tool");
      const path = data.args && typeof data.args === "object"
        ? String((data.args as Record<string, unknown>).path ?? "")
        : "";
      if (name === "fs_read" || name === "fs_read_many") {
        entries.push({ id: `ev-${ev.timestamp}-${entries.length}`, label: `Read ${path || "files"}`, detail: name });
      } else if (name === "fs_list") {
        entries.push({ id: `ev-${ev.timestamp}-${entries.length}`, label: "Listed project files" });
      } else if (name === "fs_write" || name === "fs_edit") {
        entries.push({ id: `ev-${ev.timestamp}-${entries.length}`, label: `Edited ${fileBase(path) || "file"}`, detail: path });
      } else {
        entries.push({ id: `ev-${ev.timestamp}-${entries.length}`, label: name, detail: path || undefined });
      }
    }
    if (ev.type === "tool_done") {
      const name = String(data.name ?? "");
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i]!.label.includes(name) || entries[i]!.detail?.includes(name)) {
          entries[i] = { ...entries[i]!, active: false };
          break;
        }
      }
    }
    if (ev.type === "delivery_checkpoint") {
      const files = Array.isArray(data.deliveryFiles) ? (data.deliveryFiles as string[]) : [];
      if (files.length) {
        entries.push({
          id: `ev-${ev.timestamp}-${entries.length}`,
          label: `Checkpoint · ${files.length} arquivo(s)`,
          detail: files.map(fileBase).join(", "),
        });
      }
    }
  }

  if (running && entries.length > 0) {
    const last = entries[entries.length - 1]!;
    entries[entries.length - 1] = { ...last, active: true };
  }

  return entries.slice(-80);
}

function DetailsTab({ progress, timeline }: { progress: AgentProgress; timeline: SSEEvent[] }) {
  const thoughts = useMemo(() => buildThoughtBlocks(timeline), [timeline]);
  const editedTools = progress.tools.filter(
    (t) => (t.name === "fs_write" || t.name === "fs_edit") && t.ok === true,
  );

  return (
    <div className="lovable-job-details" data-testid="job-tab-details">
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

      {editedTools.map((t, i) => (
        <section key={`${t.name}-${i}`} className="lovable-job-edited-block">
          <span className="lovable-job-edited-badge">Edited</span>
          <span className="font-mono text-sm">
            {fileBase(String(t.args?.path ?? "file"))}
          </span>
        </section>
      ))}

      {progress.streamText?.trim() && (
        <section className="lovable-job-thought-block">
          <p className="lovable-job-thought-label">Narração</p>
          <p className="lovable-job-thought-text whitespace-pre-wrap">{progress.streamText.trim()}</p>
        </section>
      )}

      {!thoughts.length && !editedTools.length && !progress.streamText?.trim() && (
        <p className="lovable-job-empty">Aguardando atividade do agente…</p>
      )}
    </div>
  );
}

function TimelineTab({ timeline, running }: { timeline: SSEEvent[]; running: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const log = useMemo(() => buildLovableLog(timeline, running), [timeline, running]);

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
                  {entry.active && <Loader2 className="inline size-3 mr-1 animate-spin" />}
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
        <AgentTimeline timeline={timeline} running={running} />
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
  const timeline = progress.timeline;

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

        {activeTab === "details" && <DetailsTab progress={progress} timeline={timeline} />}
        {activeTab === "timeline" && <TimelineTab timeline={timeline} running={running} />}
        {activeTab === "changes" && <ChangesTab progress={progress} />}
      </div>
    </div>
  );
}