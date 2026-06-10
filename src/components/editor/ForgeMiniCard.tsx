import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ForgeMiniCardData } from "@/lib/forge-run";
import { ForgeTaskList } from "@/components/editor/ForgeTaskList";

const BRIEFING_ROTATE_MS = 3500;

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
  const isLive = data.status === "working" || data.status === "thinking";
  const briefings =
    data.liveBriefings.length > 0 ? data.liveBriefings : [data.title];
  const [briefingIndex, setBriefingIndex] = useState(0);

  useEffect(() => {
    if (!isLive) {
      setBriefingIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setBriefingIndex((i) => (i + 1) % briefings.length);
    }, BRIEFING_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [isLive, briefings.length, briefings.join("\u0000")]);

  const displayTitle = isLive
    ? briefings[briefingIndex % briefings.length] ?? data.title
    : data.title;

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
        aria-label={`Job: ${displayTitle}`}
      >
        <div className="forge-mini-card-header">
          {data.status === "working" && (
            <>
              <span className="forge-mini-card-dot forge-mini-card-dot--working" aria-hidden />
              <span className="forge-mini-card-badge forge-mini-card-badge--working">Working…</span>
            </>
          )}
          {data.status === "thinking" && (
            <>
              <span className="forge-mini-card-dot forge-mini-card-dot--thinking" aria-hidden />
              <span className="forge-mini-card-badge forge-mini-card-badge--thinking">Thinking…</span>
            </>
          )}
          {data.status === "done" && (
            <>
              <span className="forge-mini-card-dot forge-mini-card-dot--done" aria-hidden />
              <span className="forge-mini-card-badge forge-mini-card-badge--done">Done</span>
            </>
          )}
          {data.status === "failed" && (
            <>
              <span className="forge-mini-card-dot forge-mini-card-dot--failed" aria-hidden />
              <span className="forge-mini-card-badge forge-mini-card-badge--failed">Failed</span>
            </>
          )}
          {data.editedFile && (
            <span className="forge-mini-card-badge forge-mini-card-badge--edited">
              Edited <span className="font-mono">{data.editedFile}</span>
            </span>
          )}
        </div>

        <p
          key={isLive ? `${briefingIndex}-${displayTitle}` : data.title}
          className={cn("forge-mini-card-title", isLive && "forge-mini-card-title--live")}
        >
          {displayTitle}
        </p>

        <ForgeTaskList tasks={data.tasks} />

        <p className="forge-mini-card-hint">{hint}</p>
      </button>
    </div>
  );
}