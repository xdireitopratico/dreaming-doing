import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { MiniCardData } from "@/lib/chat/types";
import { ChatTaskList } from "./ChatTaskList";

const BRIEFING_ROTATE_MS = 2800;

type ChatJobCardProps = {
  data: MiniCardData;
  runId: string;
  isFocused?: boolean;
  planTeaser?: boolean;
  onClick?: () => void;
};

function parseEditedHeader(header: string): { edited: boolean; file: string | null } {
  const match = /^Edited\s+(.+)$/i.exec(header.trim());
  if (!match) return { edited: false, file: null };
  return { edited: true, file: match[1].trim() };
}

export function ChatJobCard({
  data,
  runId,
  isFocused,
  planTeaser = false,
  onClick,
}: ChatJobCardProps) {
  const isLive = data.status === "working" || data.status === "thinking";
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

  const displaySubtitle = isLive
    ? (briefings[briefingIndex % briefings.length] ?? data.subtitle)
    : data.subtitle || data.title;

  const { edited, file } = parseEditedHeader(data.header);
  const isRunningCommand = /^Running command$/i.test(data.header.trim());
  const isPlanWaiting =
    planTeaser ||
    data.planReady ||
    /^Waiting for user to approve plan$/i.test(data.header.trim());
  const isDone = data.status === "done" && !isPlanWaiting;
  const isFailed = data.status === "failed";

  const hint = () => {
    if (isPlanWaiting) return "Revisar plano no inspector →";
    if (isDone && data.fileCount) return `${data.fileCount} arquivos alterados →`;
    if (data.hasPlan) return "Ver plano no inspector →";
    return "Detalhes completos →";
  };

  const cardVariant = isPlanWaiting
    ? "forge-mini-card--plan-waiting"
    : isRunningCommand && isLive
      ? "forge-mini-card--running-command"
      : isLive && !edited
        ? "forge-mini-card--working"
        : isDone
          ? "forge-mini-card--done"
          : "";

  return (
    <div
      className={cn(
        "forge-mini-card forge-mini-card-in-chat w-full",
        cardVariant,
        isFocused && "forge-mini-card--focused",
      )}
      data-testid="chat-job-card"
      data-run-id={runId}
    >
      <button type="button" className="forge-mini-card-body" onClick={onClick}>
        {edited && file && (
          <div className="forge-mini-card-edited-row">
            <span className="forge-mini-card-badge forge-mini-card-badge--edited-tag">Edited</span>
            <span className="forge-mini-card-badge forge-mini-card-badge--edited-file">{file}</span>
          </div>
        )}

        {isRunningCommand && (
          <p className="forge-mini-card-header-line forge-mini-card-header-line--command">
            Running command
          </p>
        )}

        {isPlanWaiting && !isRunningCommand && !edited && (
          <p className="forge-mini-card-header-line forge-mini-card-header-line--plan">Plan ready</p>
        )}

        {isDone && !edited && !isRunningCommand && !isPlanWaiting && (
          <div className="forge-mini-card-header">
            <span className="forge-mini-card-dot forge-mini-card-dot--done" aria-hidden />
            <span className="forge-mini-card-badge forge-mini-card-badge--done">Done</span>
          </div>
        )}

        {isFailed && (
          <div className="forge-mini-card-header">
            <span className="forge-mini-card-dot forge-mini-card-dot--failed" aria-hidden />
            <span className="forge-mini-card-badge forge-mini-card-badge--failed">Failed</span>
          </div>
        )}

        {isLive && !edited && !isRunningCommand && !isPlanWaiting && (
          <div className="forge-mini-card-header">
            <span className="forge-mini-card-dot forge-mini-card-dot--working" aria-hidden />
            <span className="forge-mini-card-badge forge-mini-card-badge--working">Working…</span>
          </div>
        )}

        {!edited && !isRunningCommand && !isPlanWaiting && data.header && !isDone && !isFailed && (
          <p className="forge-mini-card-header-line">{data.header}</p>
        )}

        <p
          key={isLive ? `${briefingIndex}-${displaySubtitle}` : displaySubtitle}
          className={cn("forge-mini-card-title", isLive && "forge-mini-card-title--live")}
        >
          {displaySubtitle}
        </p>

        {data.tasks.length > 0 && <ChatTaskList tasks={data.tasks} />}
        <p className="forge-mini-card-hint">{hint()}</p>
      </button>
    </div>
  );
}