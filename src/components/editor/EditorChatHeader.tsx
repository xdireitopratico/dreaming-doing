import { PanelLeftClose } from "lucide-react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { ProjectHeaderMenu } from "@/components/editor/ProjectHeaderMenu";

interface EditorChatHeaderProps {
  projectId: string;
  projectName?: string;
  running?: boolean;
  awaitingUser?: boolean;
  planPending?: boolean;
  pendingQueueCount?: number;
}

export function EditorChatHeader({
  projectId,
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
      <ProjectHeaderMenu
        projectId={projectId}
        projectName={projectName}
        subLabel={subLabel}
        subLabelState={headerState}
      />
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
