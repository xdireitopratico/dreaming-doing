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
    <div className="forge-inspector-diff-block">
      <button
        type="button"
        className="forge-inspector-diff-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
        <span className="forge-inspector-diff-path">{path}</span>
      </button>
      {open && (
        <pre className="forge-timeline-tool-detail mt-2">{after || before || "(vazio)"}</pre>
      )}
    </div>
  );
}

export function InspectorChanges({ progress }: InspectorChangesProps) {
  const diffs = progress.diffs;
  const delivered = progress.deliveryFiles ?? [];

  if (!diffs.length && !delivered.length) {
    return (
      <p className="forge-inspector-empty" data-testid="inspector-changes-empty">
        Nenhuma alteração registrada ainda.
      </p>
    );
  }

  return (
    <div className="forge-inspector-changes" data-testid="inspector-changes">
      <p className="forge-inspector-section-label">
        {diffs.length} arquivo{diffs.length !== 1 ? "s" : ""} alterado{diffs.length !== 1 ? "s" : ""}
      </p>

      {delivered.length > 0 && (
        <section className="mb-4">
          <p className="forge-inspector-section-label">Arquivos entregues</p>
          <ul className="forge-inspector-delivered-list">
            {delivered.map((p) => (
              <li key={p}>{p}</li>
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