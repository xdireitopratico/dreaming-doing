import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";

interface EditorChatHeaderProps {
  projectName?: string;
  running?: boolean;
}

export function EditorChatHeader({ projectName, running }: EditorChatHeaderProps) {
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
    </div>
  );
}