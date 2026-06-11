import { Link } from "@tanstack/react-router";
import { ChevronDown, PanelLeftClose } from "lucide-react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { projectDisplayName } from "@/lib/project-display-name";

interface EditorChatHeaderProps {
  projectId: string;
  projectName?: string;
  running?: boolean;
  awaitingUser?: boolean;
  planPending?: boolean;
  pendingQueueCount?: number;
  useV2Chat?: boolean;
  onToggleV2Chat?: () => void;
}

export function EditorChatHeader({
  projectId,
  projectName,
  running,
  awaitingUser,
  planPending,
  pendingQueueCount = 0,
  useV2Chat = false,
  onToggleV2Chat,
}: EditorChatHeaderProps) {
  const headerState = running
    ? "running"
    : planPending
      ? "plan-pending"
      : awaitingUser
        ? "awaiting-user"
        : pendingQueueCount > 0
          ? "queued"
          : "idle";

  const subLabel = running
    ? "Construindo alterações…"
    : planPending
      ? "Plano aguardando — chat liberado"
      : awaitingUser
        ? "Aguardando sua resposta"
        : pendingQueueCount > 0
          ? `${pendingQueueCount} na fila`
          : null;
  const toggleCollapse = () => {
    window.dispatchEvent(new CustomEvent("forge:toggle-chat-collapsed"));
  };

  return (
    <div className="forge-chat-header-inner">
      <ForgeLogoMark size={18} linkTo="/projects" title="Todos os projetos" />
      <span className="forge-topbar-divider" aria-hidden />
      <Link to="/projects/$projectId" params={{ projectId }} className="forge-project-trigger">
        <span className="forge-project-name" title={projectName ?? "Projeto"}>
          {projectDisplayName(projectName)}
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </span>
        {subLabel ? (
          <span
            className="forge-project-sub"
            data-testid="forge-header-state"
            data-state={headerState}
          >
            {subLabel}
          </span>
        ) : null}
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {onToggleV2Chat && (
          <button
            type="button"
            onClick={onToggleV2Chat}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-mono tracking-[0.12em] uppercase transition-colors ${
              useV2Chat
                ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                : "text-[var(--text-ghost)] hover:bg-white/5 hover:text-[var(--foreground)]"
            }`}
            title={useV2Chat ? "Mudar para chat v1" : "Mudar para chat v2"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${useV2Chat ? "bg-[var(--primary)]" : "bg-[var(--text-ghost)]"}`}
            />
            v{useV2Chat ? "2" : "1"}
          </button>
        )}
        <button
          type="button"
          className="forge-chat-collapse-btn"
        title="Colapsar chat"
        aria-label="Colapsar chat"
        onClick={toggleCollapse}
      >
          <PanelLeftClose className="size-4" />
        </button>
      </div>
    </div>
  );
}
