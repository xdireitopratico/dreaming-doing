import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ChevronDown, CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
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
  embedded,
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
  /** Lista inline dentro do SetupRail — sem segundo collapsible. */
  embedded?: boolean;
}) {
  const items = buildEditorReadiness({
    hasUserLlmKey,
    e2bConnected,
    prefs,
    connectorRows,
  });
  const hasError = items.some((i) => i.level === "error");
  const issueCount = useMemo(
    () => items.filter((i) => i.level !== "ok").length,
    [items],
  );
  const [open, setOpen] = useState(false);

  if (compact && !hasError) return null;

  const summary =
    issueCount === 0
      ? "Tudo pronto para Build"
      : `${issueCount} item${issueCount === 1 ? "" : "s"} pendente${issueCount === 1 ? "" : "s"}`;

  const list = (
    <ul className="space-y-1 border-t border-[var(--forge-border)]/60 px-0 pb-0 pt-2 max-h-36 overflow-y-auto forge-scrollbar-dark">
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
  );

  if (embedded) {
    return (
      <div className="mt-2 rounded-lg border border-[var(--forge-border)] bg-[var(--forge-surface-3)]/60 px-2 py-2">
        <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[var(--forge-ghost)]">
          Agente + preview · {summary}
        </p>
        {list}
      </div>
    );
  }

  return (
    <div
      className={`forge-readiness shrink-0 border-b border-[var(--forge-border)] ${
        hasError ? "bg-red-500/5" : "bg-[var(--forge-surface-2)]/40"
      }`}
      role="status"
      aria-label="Status de configuração"
    >
      <button
        type="button"
        className="forge-readiness-toggle flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={`size-3.5 shrink-0 text-[var(--forge-ghost)] transition-transform ${open ? "rotate-180" : ""}`}
        />
        <span className="min-w-0 flex-1 font-mono text-[9px] uppercase tracking-wider text-[var(--forge-ghost)]">
          Checklist · agente + preview
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] ${
            hasError
              ? "bg-red-500/15 text-red-300"
              : issueCount > 0
                ? "bg-amber-500/15 text-amber-300"
                : "bg-emerald-500/10 text-emerald-400/90"
          }`}
        >
          {summary}
        </span>
      </button>
      {open && <div className="px-3 pb-2">{list}</div>}
    </div>
  );
}