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
    <div className="lovable-job-workspace flex min-h-0 h-full w-full flex-col" data-testid="job-inspector">
      <div className="lovable-job-workspace-header">
        <button type="button" className="lovable-job-back-btn" onClick={onBackToLatest}>
          <ArrowLeft className="size-3.5" />
          Back to latest
        </button>

        <div className="lovable-job-tabs" role="tablist" aria-label="Job inspector">
          {TABS.filter((t) => t.id !== "plan" || showPlanTab).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className="lovable-job-tab"
              data-active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="lovable-job-workspace-body min-h-0 flex-1 overflow-y-auto px-4 py-3 forge-scrollbar-dark">
        <p className="lovable-job-run-id font-mono text-[9px] text-[var(--forge-ghost)] mb-3">
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