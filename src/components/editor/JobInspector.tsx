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
  /** Inspector ocupa o workspace inteiro (Lovable: job aberto = sem preview). */
  fullWidth?: boolean;
};

const TABS: { id: JobInspectorTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "changes", label: "Changes" },
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
  fullWidth = false,
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
  const normalizedTab = (activeTab as string) === "details" ? "timeline" : activeTab;
  const resolvedTab =
    normalizedTab === "plan" && showPlanTab
      ? "plan"
      : normalizedTab === "changes"
        ? "changes"
        : "timeline";

  return (
    <div
      className={`forge-inspector${fullWidth ? " forge-inspector-full" : " forge-inspector-rail"}`}
      data-testid="job-inspector"
    >
      <div className="forge-inspector-header">
        <button type="button" className="forge-inspector-back-btn" onClick={onBackToLatest}>
          Back to latest
        </button>
        <div className="forge-inspector-tabs" role="tablist" aria-label="Inspector">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={resolvedTab === tab.id}
              className="forge-inspector-tab"
              data-active={resolvedTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          {showPlanTab && (
            <button
              type="button"
              role="tab"
              aria-selected={resolvedTab === "plan"}
              className="forge-inspector-tab"
              data-active={resolvedTab === "plan"}
              onClick={() => onTabChange("plan")}
            >
              Plan
            </button>
          )}
        </div>
      </div>

      <div className="forge-inspector-body forge-scrollbar-dark">
        {resolvedTab === "timeline" && (
          <InspectorTimeline
            progress={run}
            running={running}
            onOpenFile={onOpenFile}
            runStartedAtMs={runStartedAtMs}
          />
        )}
        {resolvedTab === "changes" && <InspectorChanges progress={run} />}
        {resolvedTab === "plan" && inspectorPlan && onPlanApprove && onPlanReject && (
          <InspectorPlan
            plan={inspectorPlan.plan}
            status={inspectorPlan.status}
            awaitingApproval={inspectorPlan.awaitingApproval}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
          />
        )}
      </div>
    </div>
  );
}