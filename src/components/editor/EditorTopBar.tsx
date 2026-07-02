import { Link } from "@tanstack/react-router";
import { Code2, Eye, Moon, Share2 } from "lucide-react";
import type { EditorMainView } from "@/components/editor/editor-views";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { ProjectHeaderMenu } from "@/components/editor/ProjectHeaderMenu";
import {
  EditorIntegrationsMenu,
  type EditorIntegrationsMenuProps,
} from "@/components/editor/EditorIntegrationsMenu";

interface EditorTopBarProps {
  projectId?: string;
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
  integrations?: EditorIntegrationsMenuProps;
}

export function EditorTopBar({
  projectId,
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
  integrations,
}: EditorTopBarProps) {
  return (
    <header className="forge-topbar">
      <div className="forge-topbar-left">
        <ForgeLogoMark size={18} linkTo="/projects" title="Todos os projetos" />
        <span className="forge-topbar-divider" aria-hidden />
        {projectId ? (
          <ProjectHeaderMenu
            projectId={projectId}
            projectName={projectName}
            subLabel={running ? "Construindo alterações…" : null}
          />
        ) : (
          <Link to="/projects" className="forge-project-trigger">
            <span className="forge-project-name" title={projectName ?? "Projeto"}>
              {projectName ?? "Projeto"}
            </span>
            {running ? <span className="forge-project-sub">Construindo alterações…</span> : null}
          </Link>
        )}
      </div>

      <div className="forge-topbar-center min-w-0">
        <div className="forge-topbar-center-tools">
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
          <EditorIntegrationsMenu {...integrations} />
        </div>
      </div>

      <div className="forge-topbar-right">
        <button type="button" className="forge-connector-btn" title="Tema">
          <Moon className="size-4" />
        </button>
        <button
          type="button"
          className="forge-btn-share flex items-center gap-1.5"
          onClick={onShare}
        >
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
