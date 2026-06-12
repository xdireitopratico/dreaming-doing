import { useMemo } from "react";
import type { PendingPlan } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
type InspectorPlanProps = {
  plan: PendingPlan;
};

export function InspectorPlan({ plan }: InspectorPlanProps) {
  const markdown = useMemo(() => {
    if (plan.markdown?.trim()) return plan.markdown.trim();
    return buildForgePlanMarkdown({
      summary: plan.summary,
      rationale: plan.rationale,
      mission: plan.mission,
      objective: plan.objective,
      steps: plan.steps,
    }).markdown;
  }, [plan]);

  return (
    <div className="forge-inspector-plan" data-testid="inspector-plan">
      <div className="forge-inspector-plan-doc forge-inspector-plan-doc--preview">
        <MarkdownRenderer className="forge-inspector-plan-markdown">{markdown}</MarkdownRenderer>
      </div>
    </div>
  );
}