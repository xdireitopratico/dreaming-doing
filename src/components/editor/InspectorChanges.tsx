import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentProgress } from "@/lib/agent-progress";

type InspectorChangesProps = {
  progress: AgentProgress;
};

function DiffBlock({
  path,
  before,
  after,
}: {
  path: string;
  before: string;
  after: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[var(--border-forge)] rounded-lg overflow-hidden mb-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        <span className="font-mono text-[11px] text-[var(--text-primary)] truncate">{path}</span>
      </button>
      {open && (
        <pre className="px-3 py-2 text-[10px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap max-h-64 overflow-auto bg-[var(--bg-chat)]">
          {after || before || "(vazio)"}
        </pre>
      )}
    </div>
  );
}

export function InspectorChanges({ progress }: InspectorChangesProps) {
  const diffs = progress.diffs;
  const delivered = progress.deliveryFiles ?? [];

  if (!diffs.length && !delivered.length) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-4" data-testid="inspector-changes-empty">
        Nenhuma alteração registrada ainda.
      </p>
    );
  }

  return (
    <div className="forge-inspector-changes" data-testid="inspector-changes">
      <p className="text-[length:var(--font-task-label)] uppercase tracking-wider text-[var(--text-muted)] font-mono mb-3">
        {diffs.length} arquivo{diffs.length !== 1 ? "s" : ""} alterado{diffs.length !== 1 ? "s" : ""}
      </p>

      {delivered.length > 0 && (
        <section className="mb-4">
          <p className="text-xs text-[var(--text-muted)] mb-1">Entregues</p>
          <ul className="space-y-0.5">
            {delivered.map((p) => (
              <li key={p} className="font-mono text-[11px] text-[var(--text-secondary)]">
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {diffs.map((d) => (
        <DiffBlock key={d.id} path={d.path} before={d.before} after={d.after} />
      ))}
    </div>
  );
}