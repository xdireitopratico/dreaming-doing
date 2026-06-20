import { useMemo } from "react";
import type { PendingPlan, DesignPlanField } from "@/lib/agent-progress";
import { buildForgePlanMarkdown } from "@/lib/plan-document";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
type InspectorPlanProps = {
  plan: PendingPlan;
};

function DesignDirectionCard({ design }: { design: DesignPlanField }) {
  return (
    <div
      className="forge-inspector-plan-design"
      style={{
        borderRadius: "12px",
        border: "1px solid var(--color-border, hsl(0 0% 100% / 0.1))",
        padding: "16px",
        marginBottom: "12px",
        background: "var(--color-surface-2, hsl(0 0% 0% / 0.3))",
      }}
      data-testid="inspector-plan-design"
    >
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          opacity: 0.7,
          marginBottom: "12px",
        }}
      >
        Direção Visual
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
        {design.voice.map((lang) => (
          <span
            key={lang}
            style={{
              fontSize: "0.75rem",
              fontWeight: 500,
              padding: "2px 10px",
              borderRadius: "9999px",
              background: "var(--color-brand-500, #FFB627)",
              color: "var(--color-brand-foreground, #0B0D12)",
            }}
          >
            {lang}
          </span>
        ))}
        {design.mood && (
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 500,
              padding: "2px 10px",
              borderRadius: "9999px",
              background: "var(--color-surface-3, hsl(0 0% 100% / 0.1))",
              color: "var(--color-foreground, #fff)",
            }}
          >
            mood: {design.mood}
          </span>
        )}
      </div>

      <p style={{ fontSize: "0.875rem", lineHeight: 1.5, marginBottom: "12px", opacity: 0.9 }}>
        <strong>Momento-memorável:</strong> {design.moment}
      </p>

      {design.synthesis_reasoning && (
        <p style={{ fontSize: "0.8125rem", lineHeight: 1.5, marginBottom: "12px", opacity: 0.7 }}>
          {design.synthesis_reasoning}
        </p>
      )}

      {design.techniques.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "0.75rem", opacity: 0.6, marginRight: "8px" }}>Técnicas:</span>
          {design.techniques.map((tech) => (
            <span
              key={tech}
              style={{
                fontSize: "0.6875rem",
                padding: "1px 8px",
                borderRadius: "4px",
                marginRight: "4px",
                background: "var(--color-surface-3, hsl(0 0% 100% / 0.08))",
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      )}

      {design.references && design.references.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "0.75rem", opacity: 0.6, display: "block", marginBottom: "6px" }}>
            Referências:
          </span>
          {design.references.map((ref, i) => (
            <a
              key={i}
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: "0.75rem",
                display: "inline-block",
                marginRight: "8px",
                marginBottom: "4px",
                opacity: 0.8,
                textDecoration: "underline",
              }}
            >
              {ref.title || ref.url}
            </a>
          ))}
        </div>
      )}

      {design.anti_patterns && design.anti_patterns.length > 0 && (
        <details style={{ marginTop: "8px" }}>
          <summary style={{ fontSize: "0.75rem", cursor: "pointer", opacity: 0.6 }}>
            Anti-padrões evitados ({design.anti_patterns.length})
          </summary>
          <ul style={{ fontSize: "0.75rem", opacity: 0.6, paddingLeft: "16px", marginTop: "4px" }}>
            {design.anti_patterns.map((ap, i) => (
              <li key={i}>{ap}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

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
      {plan.design && <DesignDirectionCard design={plan.design} />}
      <div className="forge-inspector-plan-doc forge-inspector-plan-doc--preview">
        <MarkdownRenderer className="forge-inspector-plan-markdown">{markdown}</MarkdownRenderer>
      </div>
    </div>
  );
}
