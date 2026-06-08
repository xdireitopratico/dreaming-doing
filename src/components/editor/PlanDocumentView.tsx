import { useState, useEffect } from "react";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { PendingPlan } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";

type PlanDocumentViewProps = {
  plan: PendingPlan;
  editable?: boolean;
  onMarkdownChange?: (markdown: string) => void;
};

export function PlanDocumentView({ plan, editable = true, onMarkdownChange }: PlanDocumentViewProps) {
  const initial = plan.markdown?.trim()
    ? plan.markdown
    : buildForgePlanMarkdown({
        summary: plan.summary,
        rationale: plan.rationale,
        mission: plan.mission,
        objective: plan.objective,
        steps: plan.steps,
      }).markdown;

  const [markdown, setMarkdown] = useState(initial);
  const [preview, setPreview] = useState(!editable);

  useEffect(() => {
    setMarkdown(initial);
  }, [initial, plan.planId]);

  useEffect(() => {
    onMarkdownChange?.(markdown);
  }, [markdown, onMarkdownChange]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
        <p className="text-sm font-medium text-[var(--foreground)] truncate">{plan.mission ?? plan.summary}</p>
        {editable && (
          <button
            type="button"
            className="shrink-0 text-xs text-[var(--primary)] hover:underline"
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? "Editar" : "Visualizar"}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {preview || !editable ? (
          <MarkdownRenderer className="prose prose-sm max-w-none text-[var(--foreground)] [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h3]:text-sm [&_h3]:font-medium [&_li]:text-sm [&_p]:text-sm [&_p]:leading-relaxed">
            {markdown}
          </MarkdownRenderer>
        ) : (
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            className="h-full min-h-[320px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-relaxed text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            spellCheck={false}
            aria-label="Editar plano em markdown"
          />
        )}
      </div>
    </div>
  );
}