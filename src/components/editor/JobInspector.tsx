import { ArrowLeft } from "lucide-react";
import type { AgentProgress, PendingPlan, PlanStep } from "@/lib/agent-progress";
import type { JobInspectorTab } from "@/hooks/useJobWorkspaceFocus";
import { InspectorTimeline } from "@/components/editor/InspectorTimeline";
import { InspectorChanges } from "@/components/editor/InspectorChanges";
import { InspectorPlan } from "@/components/editor/InspectorPlan";

export type JobInspectorProps = {
  run: AgentProgress;
  runId: string;
  running: boolean;
  activeTab: JobInspectorTab;
  pendingPlan?: PendingPlan | null;
  onTabChange: (tab: JobInspectorTab) => void;
  onBackToLatest: () => void;
  onOpenFile?: (path: string) => void;
  onPlanApprove?: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onPlanReject?: (reason?: string) => void | Promise<void>;
};

const TABS: { id: JobInspectorTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "changes", label: "Changes" },
  { id: "plan", label: "Plan" },
];

export function JobInspector({
  run,
  runId,
  running,
  activeTab,
  pendingPlan,
  onTabChange,
  onBackToLatest,
  onOpenFile,
  onPlanApprove,
  onPlanReject,
}: JobInspectorProps) {
  const showPlanTab = !!pendingPlan;

  return (
    <div
      className="forge-job-inspector flex min-h-0 h-full w-full flex-col bg-[var(--bg-chat)]"
      data-testid="job-inspector"
    >
      <header className="flex items-center gap-3 border-b border-[var(--border-forge)] px-4 py-2 shrink-0">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={onBackToLatest}
        >
          <ArrowLeft className="size-3.5" />
          Back to latest
        </button>

        <div className="flex gap-1 ml-auto" role="tablist" aria-label="Job inspector">
          {TABS.filter((t) => t.id !== "plan" || showPlanTab).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-[var(--inspector-padding)]">
        <p className="font-mono text-[9px] text-[var(--text-muted)] mb-3">
          Run {runId.slice(0, 8)}…
        </p>

        {activeTab === "timeline" && (
          <InspectorTimeline progress={run} running={running} onOpenFile={onOpenFile} />
        )}
        {activeTab === "changes" && <InspectorChanges progress={run} />}
        {activeTab === "plan" && pendingPlan && onPlanApprove && onPlanReject && (
          <InspectorPlan plan={pendingPlan} onApprove={onPlanApprove} onReject={onPlanReject} />
        )}
      </div>
    </div>
  );
}