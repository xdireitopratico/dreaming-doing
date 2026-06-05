import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Code2,
  Eye,
  Globe,
  Moon,
  Share2,
  Smartphone,
} from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { detectProjectKind } from "@/lib/detect-project-kind";
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
  running?: boolean;
  previewFiles?: Array<{ path: string; content?: string }>;
  previewPath?: string;
  onPreviewPathChange?: (path: string) => void;
  previewDevUrl?: string | null;
  onPreviewRefresh?: () => void;
}

export function EditorTopBar({
  projectName,
  activeView,
  onViewChange,
  onShare,
  onPublish,
  running,
  previewFiles = [],
  previewPath = "/",
  onPreviewPathChange,
  previewDevUrl,
  onPreviewRefresh,
}: EditorTopBarProps) {
  const { user } = useAuth();
  const projectKind = useMemo(() => detectProjectKind(previewFiles), [previewFiles]);

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
        {projectKind && (
          <span
            className="forge-project-kind-chip hidden lg:inline-flex"
            title={
              projectKind === "mobile"
                ? "Projeto detectado como app mobile"
                : "Projeto detectado como site web"
            }
          >
            {projectKind === "mobile" ? (
              <>
                <Smartphone className="size-3" />
                App mobile
              </>
            ) : (
              <>
                <Globe className="size-3" />
                Web
              </>
            )}
          </span>
        )}
      </div>

      <div className="forge-topbar-center min-w-0">
        <div className="forge-view-icon-tabs" role="tablist" aria-label="Visualização">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "preview"}
            className="forge-view-icon-tab"
            data-active={activeView === "preview"}
            title="Preview"
            onClick={() => onViewChange("preview")}
          >
            <Eye className="size-4" />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "code"}
            className="forge-view-icon-tab"
            data-active={activeView === "code"}
            title="Código"
            onClick={() => onViewChange("code")}
          >
            <Code2 className="size-4" />
          </button>
        </div>

        <span className="forge-topbar-divider mx-1 shrink-0 hidden sm:block" aria-hidden />
        <EditorIntegrationsMenu />
        {onPreviewPathChange && (
          <>
            <span className="forge-topbar-divider mx-1 shrink-0 hidden md:block" aria-hidden />
            <PreviewRouteNav
              files={previewFiles}
              activePath={previewPath}
              onNavigate={onPreviewPathChange}
              devUrl={previewDevUrl}
              onRefresh={onPreviewRefresh}
            />
          </>
        )}
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