import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, CircleAlert } from "lucide-react";
import {
  buildEditorReadiness,
  type ReadinessItem,
} from "@/lib/editor-readiness";
import type { AgentPreferences } from "@/lib/agent-preferences";

function Icon({ level }: { level: ReadinessItem["level"] }) {
  if (level === "ok") return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400/90" />;
  if (level === "warn") return <CircleAlert className="size-3.5 shrink-0 text-amber-400/90" />;
  return <AlertCircle className="size-3.5 shrink-0 text-red-400/90" />;
}

export function EditorReadinessStrip({
  hasUserLlmKey,
  e2bConnected,
  prefs,
  connectorRows,
  compact,
}: {
  hasUserLlmKey: boolean;
  e2bConnected: boolean;
  prefs: AgentPreferences;
  connectorRows?: Array<{
    kind: string | null;
    provider?: string | null;
    meta?: Record<string, unknown> | null;
  }>;
  compact?: boolean;
}) {
  const items = buildEditorReadiness({
    hasUserLlmKey,
    e2bConnected,
    prefs,
    connectorRows,
  });
  const hasError = items.some((i) => i.level === "error");

  if (compact && !hasError) return null;

  return (
    <div
      className={`forge-readiness shrink-0 border-b border-[var(--forge-border)] px-3 py-2 ${
        hasError ? "bg-red-500/5" : "bg-[var(--forge-surface-2)]/60"
      }`}
      role="status"
      aria-label="Status de configuração"
    >
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--forge-ghost)]">
        Checklist · agente + preview
      </p>
      <ul className={`space-y-1 ${compact ? "max-h-24 overflow-y-auto" : ""}`}>
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-[10px] leading-snug">
            <Icon level={item.level} />
            <span className="min-w-0 flex-1 text-[var(--forge-silver)]">
              <strong className="text-[var(--forge-text)]">{item.label}</strong>
              {" — "}
              {item.detail}
              {item.href && (
                <>
                  {" "}
                  {item.href.includes("#") ? (
                    <a href={item.href} className="text-[var(--forge-primary)] underline">
                      Abrir
                    </a>
                  ) : (
                    <Link to={item.href} className="text-[var(--forge-primary)] underline">
                      Abrir
                    </Link>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}