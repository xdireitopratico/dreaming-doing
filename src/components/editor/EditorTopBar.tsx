import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Code2,
  Eye,
  Github,
  Moon,
  Share2,
  Database,
  Cloud,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";

interface EditorTopBarProps {
  projectName?: string;
  activeView: EditorMainView;
  onViewChange: (view: EditorMainView) => void;
  onShare?: () => void;
  onPublish?: () => void;
  running?: boolean;
}

export function EditorTopBar({
  projectName,
  activeView,
  onViewChange,
  onShare,
  onPublish,
  running,
}: EditorTopBarProps) {
  const { user } = useAuth();
  const initials =
    user?.email?.slice(0, 2).toUpperCase() ??
    user?.user_metadata?.full_name?.slice(0, 2)?.toUpperCase() ??
    "U";

  const openConnector = (name: string) => {
    toast.info(`${name} — configure em Conectores`, {
      action: {
        label: "Abrir",
        onClick: () => {
          window.location.href = "/connectors";
        },
      },
    });
  };

  return (
    <header className="forge-topbar">
      <Link to="/projects" className="forge-project-trigger">
        <span className="forge-project-name" title={projectName ?? "Projeto"}>
          {projectName ?? "Projeto"}
          <ChevronDown className="size-3 shrink-0 opacity-50" />
        </span>
        <span className="forge-project-sub">
          {running ? "Construindo alterações…" : "Visualizando última versão salva"}
        </span>
      </Link>

      <div className="forge-topbar-center">
        <button
          type="button"
          className="forge-mode-pill"
          data-active={activeView === "preview"}
          onClick={() => onViewChange("preview")}
        >
          <Eye className="size-3.5" />
          Preview
        </button>

        <button
          type="button"
          className="forge-mode-pill"
          data-active={activeView === "code"}
          onClick={() => onViewChange("code")}
        >
          <Code2 className="size-3.5" />
          Code
        </button>

        <span className="mx-1 h-4 w-px bg-[var(--forge-border-strong)]" aria-hidden />

        <button
          type="button"
          className="forge-connector-btn"
          title="GitHub"
          data-connected="true"
          onClick={() => openConnector("GitHub")}
        >
          <Github className="size-4" />
        </button>
        <button
          type="button"
          className="forge-connector-btn"
          title="Supabase"
          data-connected="true"
          onClick={() => openConnector("Supabase")}
        >
          <Database className="size-4" />
        </button>
        <button
          type="button"
          className="forge-connector-btn"
          title="Vercel"
          onClick={() => openConnector("Vercel")}
        >
          <Cloud className="size-4" />
        </button>
      </div>

      <div className="forge-topbar-right">
        <span className="forge-avatar" title={user?.email ?? ""}>
          {initials}
        </span>
        <button type="button" className="forge-connector-btn" title="Tema">
          <Moon className="size-4" />
        </button>
        <button type="button" className="forge-btn-share flex items-center gap-1.5" onClick={onShare}>
          <Share2 className="size-3.5" />
          Share
        </button>
        <button type="button" className="forge-btn-publish" onClick={onPublish}>
          Publish
        </button>
      </div>
    </header>
  );
}