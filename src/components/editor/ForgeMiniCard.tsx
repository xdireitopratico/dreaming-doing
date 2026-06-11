import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ForgeMiniCardData } from "@/lib/forge-run";
import { ForgeTaskList } from "@/components/editor/ForgeTaskList";

const BRIEFING_ROTATE_MS = 2800;

type ForgeMiniCardProps = {
  data: ForgeMiniCardData;
  runId: string;
  isFocused?: boolean;
  planTeaser?: boolean;
  onOpenInspector: (runId: string, tab?: "details" | "timeline" | "changes" | "plan") => void;
};

export function ForgeMiniCard({
  data,
  runId,
  isFocused,
  planTeaser = false,
  onOpenInspector,
}: ForgeMiniCardProps) {
  const isLive = data.status === "working" || data.status === "thinking";
  const showWorkingBadge = isLive && !data.planReady;
  const briefings =
    data.liveBriefings.length > 0 ? data.liveBriefings : [data.subtitle || data.title];
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

  const displayHeader = data.header || data.title;
  const displaySubtitle = isLive
    ? (briefings[briefingIndex % briefings.length] ?? data.subtitle)
    : data.subtitle || data.title;

  const hint =
    data.planReady || planTeaser
      ? "Revisar plano no inspector →"
      : data.status === "done" && data.fileCount
        ? `${data.fileCount} arquivos alterados →`
        : data.hasPlan
          ? "Ver plano no inspector →"
          : "Detalhes completos →";

  const statusClass = showWorkingBadge
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
        onClick={() => onOpenInspector(runId, data.planReady || planTeaser ? "plan" : "details")}
        aria-label={`Job: ${displayHeader}`}
      >
        <div className="forge-mini-card-header">
          {showWorkingBadge && (
            <>
              <span className="forge-mini-card-dot forge-mini-card-dot--working" aria-hidden />
              <span className="forge-mini-card-badge forge-mini-card-badge--working">Working…</span>
            </>
          )}
          {(data.planReady || planTeaser) && (
            <>
              <span className="forge-mini-card-dot forge-mini-card-dot--working" aria-hidden />
              <span className="forge-mini-card-badge forge-mini-card-badge--working">
                Plan ready
              </span>
            </>
          )}
          {data.status === "done" && !data.planReady && !planTeaser && (
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
        </div>

        <p className="forge-mini-card-header-line">{displayHeader}</p>
        <p
          key={isLive ? `${briefingIndex}-${displaySubtitle}` : displaySubtitle}
          className={cn("forge-mini-card-title", isLive && "forge-mini-card-title--live")}
        >
          {displaySubtitle}
        </p>

        <ForgeTaskList tasks={data.tasks} />

        <p className="forge-mini-card-hint">{hint}</p>
      </button>
    </div>
  );
}
