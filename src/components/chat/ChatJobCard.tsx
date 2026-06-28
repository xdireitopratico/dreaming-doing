import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MiniCardData } from "@/lib/chat/types";
import {
  Check,
  Circle,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  GitCompareArrows,
  Globe,
  Loader2,
  Package,
  Search,
  Terminal,
  X,
} from "lucide-react";

type ChatJobCardProps = {
  data: MiniCardData;
  runId: string;
  isFocused?: boolean;
  onClick?: () => void;
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

/** Ícone de status por estado da tarefa atômica. */
function taskStatusIcon(status: "pending" | "active" | "done" | "failed"): React.ReactNode {
  switch (status) {
    case "done":
      return <Check className="size-3 text-[var(--status-done)]" />;
    case "active":
      return <Loader2 className="size-3 animate-spin text-[var(--status-working)]" />;
    case "failed":
      return <X className="size-3 text-[var(--status-failed)]" />;
    default:
      return <Circle className="size-3 text-[var(--text-muted)]" />;
  }
}

function compactTaskText(task: { label: string; criteria?: string }, max = 120): string {
  const text = [task.label.trim(), task.criteria?.trim()].filter(Boolean).join(" · ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
  const isDone = data.status === "done";
  const isFailed = data.status === "failed";
  const { edited, file } = parseEditedHeader(data.header);
  const isRunningCommand = /^Running command$/i.test(data.header.trim());

  // Checklist recolhível — mostra as 4 primeiras por padrão, botão expande o resto.
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const TASKS_PREVIEW = 4;
  const tasks = data.tasks ?? [];
  const visibleTasks = tasksExpanded ? tasks : tasks.slice(0, TASKS_PREVIEW);
  const hasMoreTasks = tasks.length > TASKS_PREVIEW;
  const hiddenTasksCount = tasks.length - TASKS_PREVIEW;

  const hint = () => {
    if (isDone && data.fileCount) return `${data.fileCount} arquivos alterados →`;
    if (data.hasPlan) return "Ver plano no inspector →";
    return "Timeline completa →";
  };

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

  const cardVariant =
    (isRunningCommand || edited) && isLive
      ? "forge-mini-card--running-command"
      : isLive && !edited && !isRunningCommand
        ? "forge-mini-card--working"
        : isDone
          ? "forge-mini-card--done"
          : "";

  const statusBadge = isLive
    ? isDone || isFailed
      ? isFailed ? "Failed" : "Done"
      : "Working"
    : isDone
      ? "Done"
      : isFailed
        ? "Failed"
        : "Working";

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

        {/* Linha viva única — estado atual do job (rotativo). */}
        {isLive && !edited && !isRunningCommand && !isDone && !isFailed && (
          <div className="forge-mini-card-live-header" data-testid="chat-mini-card-live-line">
            <span className="forge-mini-card-live-dot" aria-hidden />
            <span className="forge-mini-card-live-badge">{statusBadge}</span>
            <span className="forge-mini-card-live-line">{data.liveLine}</span>
          </div>
        )}

        {!isLive && !edited && !isRunningCommand && data.header && !isDone && !isFailed && (
          <p className="forge-mini-card-header-line">{data.header}</p>
        )}

        {/* Checklist de tarefas atômicas — recolhível (4 + botão Ver mais). */}
        {tasks.length > 0 && (
          <ul className="forge-mini-card-task-list" data-testid="chat-mini-card-task-list">
            {visibleTasks.map((task, idx) => (
              <li
                key={task.id || idx}
                className={cn(
                  "forge-mini-card-task-item",
                  `forge-mini-card-task-item--${task.status}`,
                )}
                data-status={task.status}
              >
                <span className="forge-mini-card-task-status" aria-hidden>
                  {taskStatusIcon(task.status)}
                </span>
                <span className="forge-mini-card-task-body">
                  <span
                    className="forge-mini-card-task-label"
                    title={[task.label, task.criteria].filter(Boolean).join(" · ")}
                  >
                    {compactTaskText(task)}
                  </span>
                </span>
              </li>
            ))}
            {hasMoreTasks && (
              <li>
                <button
                  type="button"
                  className="forge-mini-card-task-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTasksExpanded((v) => !v);
                  }}
                  data-testid="chat-mini-card-task-toggle"
                >
                  {tasksExpanded ? "Ver menos" : `+${hiddenTasksCount} tarefas`}
                </button>
              </li>
            )}
          </ul>
        )}

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

        <p className="forge-mini-card-hint">{hint()}</p>
      </button>
    </div>
  );
}
