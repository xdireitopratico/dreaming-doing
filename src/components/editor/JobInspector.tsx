import { useMemo } from "react";
import type { AgentProgress, PendingPlan, PlanStep } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import type { JobInspectorTab } from "@/hooks/useJobWorkspaceFocus";
import { resolveInspectorPlanForRun } from "@/lib/plan-message-meta";
import { InspectorTimeline } from "@/components/editor/InspectorTimeline";
import { InspectorChanges } from "@/components/editor/InspectorChanges";
import { InspectorPlan } from "@/components/editor/InspectorPlan";

export type JobInspectorProps = {
  run: AgentProgress;
  runId: string;
  running: boolean;
  activeTab: JobInspectorTab;
  messages: ChatMessage[];
  livePendingPlan?: PendingPlan | null;
  onTabChange: (tab: JobInspectorTab) => void;
  onBackToLatest: () => void;
  onOpenFile?: (path: string) => void;
  onPlanApprove?: (steps: PlanStep[], markdown?: string) => void | Promise<void>;
  onPlanReject?: (reason?: string) => void | Promise<void>;
  runStartedAtMs?: number | null;
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
  messages,
  livePendingPlan,
  onTabChange,
  onBackToLatest,
  onOpenFile,
  onPlanApprove,
  onPlanReject,
  runStartedAtMs,
}: JobInspectorProps) {
  const inspectorPlan = useMemo(
    () =>
      resolveInspectorPlanForRun(runId, messages, {
        livePlan: livePendingPlan,
        progressPlan: run.pendingPlan,
      }),
    [runId, messages, livePendingPlan, run.pendingPlan],
  );

  const showPlanTab = !!inspectorPlan;

  return (
    <div className="forge-inspector" data-testid="job-inspector">
      <div className="forge-inspector-header">
        <div className="forge-inspector-tabs" role="tablist" aria-label="Job inspector">
          {TABS.filter((t) => t.id !== "plan" || showPlanTab).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className="forge-inspector-tab"
              data-active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" className="forge-inspector-close-btn" onClick={onBackToLatest}>
          Fechar inspector
        </button>
      </div>

      <div className="forge-inspector-body forge-scrollbar-dark">
        {activeTab === "timeline" && (
          <InspectorTimeline
            progress={run}
            running={running}
            onOpenFile={onOpenFile}
            runStartedAtMs={runStartedAtMs}
          />
        )}
        {activeTab === "changes" && <InspectorChanges progress={run} />}
        {activeTab === "plan" && inspectorPlan && onPlanApprove && onPlanReject ? (
          <InspectorPlan
            plan={inspectorPlan.plan}
            status={inspectorPlan.status}
            awaitingApproval={inspectorPlan.awaitingApproval}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
          />
        ) : activeTab === "plan" ? (
          <InspectorTimeline
            progress={run}
            running={running}
            onOpenFile={onOpenFile}
            runStartedAtMs={runStartedAtMs}
          />
        ) : null}
      </div>
    </div>
  );
}