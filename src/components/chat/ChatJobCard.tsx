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
import { PlanPhaseListFromPlan } from "./PlanPhaseList";

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

/** Ícone semântico por tipo de tool — não genérico check/loader. */
function toolTypeIcon(toolName?: string): React.ReactNode {
  switch (toolName) {
    case "fs_read":
    case "fs_list":
    case "fs_read_many":
      return <FileText className="size-3.5" />;
    case "fs_write":
    case "fs_edit":
      return <FileCode className="size-3.5" />;
    case "shell_exec":
      return <Terminal className="size-3.5" />;
    case "fs_search":
    case "fs_glob":
    case "web_search":
      return <Search className="size-3.5" />;
    case "web_fetch":
    case "observe":
      return <Globe className="size-3.5" />;
    case "install_dep":
    case "package_install":
      return <Package className="size-3.5" />;
    default:
      return <Eye className="size-3.5" />;
  }
}

/** Ícone de status overlay — pequeno, ao lado do ícone de tool type. */
function statusDotIcon(status: MiniCardData["activity"][number]["status"]) {
  switch (status) {
    case "done":
      return <Check className="size-2.5 text-[var(--status-done)]" />;
    case "active":
      return <Loader2 className="size-2.5 animate-spin text-[var(--status-working)]" />;
    case "failed":
      return <X className="size-2.5 text-[var(--status-failed)]" />;
    default:
      return <Circle className="size-2.5 text-[var(--text-muted)]" />;
  }
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

  const { edited, file } = parseEditedHeader(data.header);
  const isRunningCommand = /^Running command$/i.test(data.header.trim());
  const isDone = data.status === "done";
  const isFailed = data.status === "failed";

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

  // Activity stream — 5 itens com ícone semântico + subtítulo.
  const hasActivity = data.activity.length > 0;
  const visibleActivity = data.activity.slice(0, 5);

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

        {/* Header live — badge compacto "Working" + briefing real como subtítulo.
            Elimina a duplicação de duas linhas "Working" que existia antes. */}
        {isLive && !edited && !isRunningCommand && !isDone && !isFailed && (
          <div className="forge-mini-card-live-header">
            <span className="forge-mini-card-live-dot" aria-hidden />
            <span className="forge-mini-card-live-badge">Working</span>
            {latestBriefing && latestBriefing !== "Working" && (
              <span className="forge-mini-card-live-subtitle">{latestBriefing}</span>
            )}
          </div>
        )}

        {!isLive && !edited && !isRunningCommand && data.header && !isDone && !isFailed && (
          <p className="forge-mini-card-header-line">{data.header}</p>
        )}

        {/* Sem activity: mostra briefing como título (fallback). */}
        {!isLive && !hasActivity && (
          <p className={cn("forge-mini-card-title")}>
            {data.subtitle || data.title}
          </p>
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

        {/* Activity stream rica — ícone semântico + título + subtítulo + status visual.
            Cada item mostra o que o agente FAZ em tempo real, não só um label flat. */}
        {hasActivity ? (
          <ul className="forge-mini-card-activity" data-testid="chat-mini-card-activity">
            {visibleActivity.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "forge-mini-card-activity-item",
                  line.toolName && `forge-mini-card-activity-item--tool-${line.toolName}`,
                  `forge-mini-card-activity-item--${line.status}`,
                )}
              >
                <span className="forge-mini-card-activity-icon" aria-hidden>
                  {line.toolName ? toolTypeIcon(line.toolName) : toolTypeIcon()}
                </span>
                <span className="forge-mini-card-activity-body">
                  <span className="forge-mini-card-activity-label">{line.label}</span>
                  {line.description && (
                    <span className="forge-mini-card-activity-desc">{line.description}</span>
                  )}
                </span>
                <span className="forge-mini-card-activity-status" aria-hidden>
                  {statusDotIcon(line.status)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {!hasActivity && data.tasks && data.tasks.length > 0 && (
          <ul className="forge-task-list">
            {data.tasks.slice(0, 5).map((task, idx) => (
              <li key={task.id || idx} className="forge-task-item" data-status={task.status}>
                <span className="forge-task-icon">
                  {task.status === 'done' ? '☑' : task.status === 'active' ? '◐' : '○'}
                </span>
                <span className="forge-task-label">{task.label}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="forge-mini-card-hint">{hint()}</p>
      </button>
    </div>
  );
}
