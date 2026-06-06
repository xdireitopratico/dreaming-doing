import { Link } from "@tanstack/react-router";
import { ChevronDown, PanelLeftClose } from "lucide-react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";

interface EditorChatHeaderProps {
  projectName?: string;
  running?: boolean;
}

export function EditorChatHeader({ projectName, running }: EditorChatHeaderProps) {
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
        <span className="forge-project-sub">
          {running ? "Construindo alterações…" : "Visualizando última versão salva"}
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
