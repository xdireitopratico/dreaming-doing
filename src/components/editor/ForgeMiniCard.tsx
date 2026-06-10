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
        : "Timeline completa no inspector →";

  const statusClass =
    data.status === "working"
      ? "lovable-job-mini-card--working"
      : data.status === "done"
        ? "lovable-job-mini-card--done"
        : data.status === "failed"
          ? ""
          : "";

  return (
    <div
      className={cn(
        "lovable-job-mini-card w-full forge-animate-card-appear",
        statusClass,
        isFocused && "lovable-job-mini-card--focused",
      )}
      data-testid="forge-mini-card"
      data-run-id={runId}
    >
      <button
        type="button"
        className="lovable-job-mini-card-body"
        onClick={() => onOpenInspector(runId, data.hasPlan ? "plan" : "timeline")}
        aria-label={`Job: ${data.title}`}
      >
        <div className="lovable-job-mini-card-header">
          {data.status === "working" && (
            <span className="lovable-job-mini-card-badge-working">Working…</span>
          )}
          {data.status === "thinking" && (
            <span className="lovable-job-mini-card-badge-working">Thinking…</span>
          )}
          {data.status === "done" && (
            <span className="lovable-job-mini-card-badge-done">Done</span>
          )}
          {data.status === "failed" && (
            <span className="lovable-job-mini-card-badge-partial">Failed</span>
          )}
          {data.editedFile && (
            <span className="lovable-job-mini-card-badge-edited">
              Edited <span className="font-mono">{data.editedFile}</span>
            </span>
          )}
        </div>

        <p className="lovable-job-mini-card-title">{data.title}</p>

        <ForgeTaskList tasks={data.tasks} />

        <p className="lovable-job-mini-card-hint">{hint}</p>
      </button>
    </div>
  );
}