import { Link } from "@tanstack/react-router";
import { ChevronDown, PanelLeftClose } from "lucide-react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";

interface EditorChatHeaderProps {
  projectName?: string;
  running?: boolean;
  awaitingUser?: boolean;
  planPending?: boolean;
  pendingQueueCount?: number;
}

export function EditorChatHeader({
  projectName,
  running,
  awaitingUser,
  planPending,
  pendingQueueCount = 0,
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
      ? "Plano aguardando aprovação"
      : awaitingUser
        ? "Aguardando sua resposta"
        : pendingQueueCount > 0
        ? `${pendingQueueCount} na fila`
        : "Visualizando última versão salva";
  const toggleCollapse = () => {
    window.dispatchEvent(new CustomEvent("forge:toggle-chat-collapsed"));
  };

  return (
    <div className="forge-chat-header-inner">
      <ForgeLogoMark size={18} linkTo="/projects" />
      <span className="forge-topbar-divider" aria-hidden />
      <Link to="/projects" className="forge-project-trigger">
        <span className="forge-project-name" title={projectName ?? "Projeto"}>
          {projectName ?? "Projeto"}
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </span>
        <span
          className="forge-project-sub"
          data-testid="forge-header-state"
          data-state={headerState}
        >
          {subLabel}
        </span>
      </Link>
      <button
        type="button"
        className="forge-chat-collapse-btn ml-auto"
        title="Colapsar chat"
        aria-label="Colapsar chat"
        onClick={toggleCollapse}
      >
        <PanelLeftClose className="size-4" />
      </button>
    </div>
  );
}
