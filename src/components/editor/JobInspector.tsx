import { useEffect, useMemo, useRef } from "react";
import type { AgentProgress, PendingPlan, PlanStep } from "@/lib/agent-progress";
import type { ChatMessage } from "@/lib/chat-types";
import type { JobInspectorTab } from "@/hooks/useJobWorkspaceFocus";
import { resolveInspectorPlanForRun } from "@/lib/plan-message-meta";
import { InspectorTimeline } from "@/components/editor/InspectorTimeline";
import { InspectorChanges } from "@/components/editor/InspectorChanges";
import { InspectorPlan } from "@/components/editor/InspectorPlan";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";

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
  onPlanEditRequest?: (plan: PendingPlan) => void;
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
  onPlanEditRequest,
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

  // Fase 1.7 — telemetria: se este run foi originado de um plano aprovado
  // (build run com planSourceRunId), mas o inspector não consegue
  // reconstruir o plano (inspectorPlan === null), emitimos
  // `plan_source_runid_missing` para diagnóstico. Causa típica: meta JSONB
  // do INSERT não persistiu `planSourceRunId` (fail silencioso do Supabase
  // JSONB apply). Hoje a UI mostra tab Plan oculto sem explicação.
  const planDiagEmittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (inspectorPlan) {
      planDiagEmittedRef.current = null;
      return;
    }
    const isBuildRun = messages.some(
      (m) =>
        m.role === "user" && (m.meta as Record<string, unknown> | undefined)?.buildRunId === runId,
    );
    if (!isBuildRun) return;
    if (planDiagEmittedRef.current === runId) return;
    planDiagEmittedRef.current = runId;
    emitStreamingTelemetry("agent.plan_source_runid_missing", { runId });
  }, [inspectorPlan, messages, runId]);

  return (
    <div
      className={`forge-inspector${fullWidth ? " forge-inspector-full" : " forge-inspector-rail"}`}
      data-testid="job-inspector"
    >
      <div className="forge-inspector-header">
        <button type="button" className="forge-inspector-back-btn" onClick={onBackToLatest}>
          Back to latest
        </button>
        <div className="forge-inspector-title">Details</div>
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
        {resolvedTab === "plan" && inspectorPlan && (
          <InspectorPlan
            state={inspectorPlan}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
            onEditRequest={onPlanEditRequest}
          />
        )}
      </div>
    </div>
  );
}
