import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Code2,
  Eye,
  Moon,
  Share2,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { EditorIntegrationsMenu } from "@/components/editor/EditorIntegrationsMenu";
import { PreviewRouteNav } from "@/components/editor/PreviewRouteNav";

interface EditorTopBarProps {
  projectName?: string;
  activeView: EditorMainView;
  onViewChange: (view: EditorMainView) => void;
  onShare?: () => void;
  onPublish?: () => void;
  onQuickPrompt?: (text: string) => void;
  running?: boolean;
  /** Rotas do preview (só quando aba Preview). */
  previewFiles?: Array<{ path: string; content?: string }>;
  previewPath?: string;
  onPreviewPathChange?: (path: string) => void;
  previewDevUrl?: string | null;
}

export function EditorTopBar({
  projectName,
  activeView,
  onViewChange,
  onShare,
  onPublish,
  onQuickPrompt,
  running,
  previewFiles,
  previewPath = "/",
  onPreviewPathChange,
  previewDevUrl,
}: EditorTopBarProps) {
  const { user } = useAuth();

  const initials =
    user?.email?.slice(0, 2).toUpperCase() ??
    user?.user_metadata?.full_name?.slice(0, 2)?.toUpperCase() ??
    "U";

  return (
    <header className="forge-topbar">
      <div className="forge-topbar-left">
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
        {onQuickPrompt && (
          <button
            type="button"
            className="forge-voc-chip hidden lg:inline-flex"
            title="Sugerir app mobile VOC no chat"
            onClick={() =>
              onQuickPrompt(
                "Crie um app mobile VOC (voz do cliente) completo: onboarding, dashboard e fluxo principal. Design moderno, responsivo e pronto para publicar.",
              )
            }
          >
            <Smartphone className="size-3" />
            App mobile VOC
          </button>
        )}
      </div>

      <div className="forge-topbar-center min-w-0">
        <div className="flex shrink-0 items-center gap-1">
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
        </div>

        {activeView === "preview" && previewFiles && onPreviewPathChange && (
          <>
            <span className="forge-topbar-divider mx-1 shrink-0" aria-hidden />
            <PreviewRouteNav
              variant="topbar"
              files={previewFiles}
              activePath={previewPath}
              onNavigate={onPreviewPathChange}
              devUrl={previewDevUrl}
            />
          </>
        )}

        <span className="forge-topbar-divider mx-1 shrink-0 hidden sm:block" aria-hidden />
        <EditorIntegrationsMenu />
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