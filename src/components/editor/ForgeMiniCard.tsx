import { cn } from "@/lib/utils";
import type { ForgeMiniCardData } from "@/lib/forge-run";
import { ForgeTaskList } from "@/components/editor/ForgeTaskList";

type ForgeMiniCardProps = {
  data: ForgeMiniCardData;
  runId: string;
  isFocused?: boolean;
  onOpenInspector: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
};

export function ForgeMiniCard({
  data,
  runId,
  isFocused,
  onOpenInspector,
}: ForgeMiniCardProps) {
  const hint =
    data.status === "done" && data.fileCount
      ? `${data.fileCount} arquivos alterados →`
      : data.hasPlan
        ? "Ver plano no inspector →"
        : "Timeline completa →";

  const statusClass =
    data.status === "working"
      ? "forge-mini-card--working"
      : data.status === "done"
        ? "forge-mini-card--done"
        : "";

  return (
    <div
      className={cn(
        "forge-mini-card w-full forge-animate-card-appear",
        statusClass,
        isFocused && "forge-mini-card--focused",
      )}
      data-testid="forge-mini-card"
      data-run-id={runId}
    >
      <button
        type="button"
        className="forge-mini-card-body"
        onClick={() => onOpenInspector(runId, data.hasPlan ? "plan" : "timeline")}
        aria-label={`Job: ${data.title}`}
      >
        <div className="forge-mini-card-header">
          {data.status === "working" && (
            <span className="forge-mini-card-badge forge-mini-card-badge--working">Working…</span>
          )}
          {data.status === "thinking" && (
            <span className="forge-mini-card-badge forge-mini-card-badge--thinking">Thinking…</span>
          )}
          {data.status === "done" && (
            <span className="forge-mini-card-badge forge-mini-card-badge--done">Done</span>
          )}
          {data.status === "failed" && (
            <span className="forge-mini-card-badge forge-mini-card-badge--failed">Failed</span>
          )}
          {data.editedFile && (
            <span className="forge-mini-card-badge forge-mini-card-badge--edited">
              Edited <span className="font-mono">{data.editedFile}</span>
            </span>
          )}
        </div>

        <p className="forge-mini-card-title">{data.title}</p>

        <ForgeTaskList tasks={data.tasks} />

        <p className="forge-mini-card-hint">{hint}</p>
      </button>
    </div>
  );
}