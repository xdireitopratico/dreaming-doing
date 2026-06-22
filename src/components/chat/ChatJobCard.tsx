import { cn } from "@/lib/utils";
import type { MiniCardData } from "@/lib/chat/types";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  GitCompareArrows,
  Loader2,
  Terminal,
  XCircle,
} from "lucide-react";
import { PlanPhaseListFromPlan } from "./PlanPhaseList";

type ChatJobCardProps = {
  data: MiniCardData;
  runId: string;
  isFocused?: boolean;
  onClick?: () => void;
  /** Fase 2.2 — handlers de action chips. */
  onOpenFile?: (path: string) => void;
  onShowDiff?: (runId: string) => void;
  onShowOutput?: (runId: string) => void;
  onShowPreview?: (runId: string) => void;
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
  onClick,
  onOpenFile,
  onShowDiff,
  onShowOutput,
  onShowPreview,
}: ChatJobCardProps) {
  const isLive = data.status === "working" || data.status === "thinking";
  const latestBriefing = data.liveBriefings[0] ?? (data.subtitle || data.title);
  const displaySubtitle = isLive ? latestBriefing : data.subtitle || data.title;

  const { edited, file } = parseEditedHeader(data.header);
  const isRunningCommand = /^Running command$/i.test(data.header.trim());
  const isDone = data.status === "done";
  const isFailed = data.status === "failed";

  const hint = () => {
    if (isDone && data.fileCount) return `${data.fileCount} arquivos alterados →`;
    if (data.hasPlan) return "Ver plano no inspector →";
    return "Timeline completa →";
  };

  // Fase 2.2 — action chips Lovable-style. Cada chip dispara uma ação
  // contextual: abrir o arquivo, ver o diff completo no inspector, abrir o
  // output de shell, ou abrir o preview. Só renderiza chips que têm handler
  // (evita botão quebrado).
  const chips: Array<{
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: (e: React.MouseEvent) => void;
    visible: boolean;
  }> = [
    {
      key: "show-file",
      label: data.lastTool?.path ? `Show ${data.lastTool.path.split("/").pop()}` : "Show file",
      icon: FileText,
      onClick: (e) => {
        e.stopPropagation();
        if (data.lastTool?.path) onOpenFile?.(data.lastTool.path);
      },
      visible:
        !!data.lastTool?.path &&
        (data.lastTool.name === "fs_read" ||
          data.lastTool.name === "fs_write" ||
          data.lastTool.name === "fs_edit") &&
        !!onOpenFile,
    },
    {
      key: "show-diff",
      label: "Show diff",
      icon: GitCompareArrows,
      onClick: (e) => {
        e.stopPropagation();
        onShowDiff?.(runId);
      },
      visible: isDone && !!data.fileCount && data.fileCount > 0 && !!onShowDiff,
    },
    {
      key: "show-output",
      label: "Show output",
      icon: Terminal,
      onClick: (e) => {
        e.stopPropagation();
        onShowOutput?.(runId);
      },
      visible: !!data.lastTool && data.lastTool.name === "shell_exec" && !!onShowOutput,
    },
    {
      key: "show-preview",
      label: "Show preview",
      icon: ExternalLink,
      onClick: (e) => {
        e.stopPropagation();
        onShowPreview?.(runId);
      },
      visible: isDone && !!onShowPreview,
    },
  ];
  const visibleChips = chips.filter((c) => c.visible);
  const visibleTasks = data.tasks.slice(0, 6);
  const hiddenTaskCount = Math.max(0, data.tasks.length - visibleTasks.length);

  const cardVariant =
    (isRunningCommand || edited) && isLive
      ? "forge-mini-card--running-command"
      : isLive && !edited && !isRunningCommand
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

        {isDone && !edited && !isRunningCommand && (
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

        {!edited && !isRunningCommand && data.header && !isDone && !isFailed && (
          <p className="forge-mini-card-header-line">{data.header}</p>
        )}

        <p className={cn("forge-mini-card-title", isLive && "forge-mini-card-title--live")}>
          {displaySubtitle}
        </p>

        {visibleChips.length > 0 && (
          <div className="forge-mini-card-chips" data-testid="chat-mini-card-chips">
            {visibleChips.map(({ key, label, icon: Icon, onClick: handler }) => (
              <button
                key={key}
                type="button"
                className="forge-mini-card-chip"
                onClick={handler}
                data-testid={`chat-mini-card-chip-${key}`}
              >
                <Icon className="size-3" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {data.pendingPlan && data.pendingPlan.steps.length > 0 ? (
          <PlanPhaseListFromPlan
            plan={data.pendingPlan}
            compact
            className="forge-plan-phases forge-plan-phases--in-card"
          />
        ) : visibleTasks.length > 0 ? (
          <ul className="forge-task-list" data-testid="chat-mini-card-task-list">
            {visibleTasks.map((task) => {
              const Icon =
                task.status === "done"
                  ? CheckCircle2
                  : task.status === "failed"
                    ? XCircle
                    : task.status === "active"
                      ? Loader2
                      : Circle;
              return (
                <li key={task.id} className="forge-task-item" data-status={task.status}>
                  <Icon
                    className={cn(
                      "forge-task-icon size-3.5 shrink-0",
                      task.status === "active" && "forge-task-icon--active animate-spin",
                    )}
                  />
                  <span className="forge-task-label">{task.label}</span>
                </li>
              );
            })}
            {hiddenTaskCount > 0 && (
              <li className="forge-task-item forge-task-item--more">
                <span className="forge-task-icon forge-task-icon--more" aria-hidden>
                  +{hiddenTaskCount}
                </span>
                <span className="forge-task-label">more plan steps</span>
              </li>
            )}
          </ul>
        ) : null}

        <p className="forge-mini-card-hint">{hint()}</p>
      </button>
    </div>
  );
}
