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
    <div className="lovable-job-edited-block mb-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
        <span className="font-mono text-[11px] text-[var(--forge-foreground)] truncate">{path}</span>
      </button>
      {open && (
        <pre className="lovable-job-log-detail mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
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
      <p className="lovable-job-empty" data-testid="inspector-changes-empty">
        Nenhuma alteração registrada ainda.
      </p>
    );
  }

  return (
    <div className="lovable-job-changes" data-testid="inspector-changes">
      <p className="lovable-job-section-label">
        {diffs.length} arquivo{diffs.length !== 1 ? "s" : ""} alterado{diffs.length !== 1 ? "s" : ""}
      </p>

      {delivered.length > 0 && (
        <section className="mb-4">
          <p className="lovable-job-section-label">Arquivos entregues</p>
          <ul className="lovable-job-delivered-list">
            {delivered.map((p) => (
              <li key={p} className="font-mono text-[11px] text-[var(--forge-silver)]">
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