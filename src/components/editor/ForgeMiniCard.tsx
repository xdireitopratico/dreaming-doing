import { cn } from "@/lib/utils";
import type { ForgeMiniCardData } from "@/lib/forge-run";
import { ForgeTaskList } from "@/components/editor/ForgeTaskList";

type ForgeMiniCardProps = {
  data: ForgeMiniCardData;
  runId: string;
  isFocused?: boolean;
  onOpenInspector: (runId: string, tab?: "timeline" | "changes" | "plan") => void;
};

const STATUS_LABEL: Record<ForgeMiniCardData["status"], string> = {
  thinking: "Thinking…",
  working: "Working…",
  done: "Done",
  failed: "Failed",
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

  return (
    <div
      className={cn(
        "forge-mini-card w-full rounded-lg border border-[var(--border-forge)] bg-[var(--bg-card)] forge-animate-card-appear",
        data.status === "working" && "border-[var(--border-active)]/40",
        isFocused && "ring-1 ring-[var(--border-active)]",
      )}
      data-testid="forge-mini-card"
      data-run-id={runId}
    >
      <button
        type="button"
        className="w-full text-left p-[var(--card-padding)] hover:bg-[var(--bg-hover)] transition-colors rounded-lg"
        onClick={() => onOpenInspector(runId, data.hasPlan ? "plan" : "timeline")}
        aria-label={`Job: ${data.title}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              "text-[10px] font-medium uppercase tracking-wide",
              data.status === "working" && "text-[var(--status-working)]",
              data.status === "done" && "text-[var(--status-done)]",
              data.status === "failed" && "text-[var(--status-failed)]",
              data.status === "thinking" && "text-[var(--status-thinking)]",
            )}
          >
            {STATUS_LABEL[data.status]}
          </span>
          {data.editedFile && (
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              Edited {data.editedFile}
            </span>
          )}
        </div>

        <p className="text-[length:var(--font-card-title)] font-semibold text-[var(--text-primary)]">
          {data.title}
        </p>

        <ForgeTaskList tasks={data.tasks} />

        <p className="mt-2 text-[10px] text-[var(--text-muted)]">{hint}</p>
      </button>
    </div>
  );
}