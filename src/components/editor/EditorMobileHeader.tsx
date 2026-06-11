import { Link } from "@tanstack/react-router";
import { RefreshCw, Share2 } from "lucide-react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { projectDisplayName } from "@/lib/project-display-name";

export type EditorMobilePanel = "chat" | "workspace";

type EditorMobilePanelToggleProps = {
  value: EditorMobilePanel;
  onChange: (value: EditorMobilePanel) => void;
};

export function EditorMobilePanelToggle({ value, onChange }: EditorMobilePanelToggleProps) {
  return (
    <div className="seg-toggle forge-mobile-panel-toggle" role="tablist" aria-label="Painel do editor">
      <button
        type="button"
        role="tab"
        aria-selected={value === "chat"}
        data-active={value === "chat" ? "true" : undefined}
        onClick={() => onChange("chat")}
      >
        Chat
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "workspace"}
        data-active={value === "workspace" ? "true" : undefined}
        onClick={() => onChange("workspace")}
      >
        Preview
      </button>
    </div>
  );
}

type EditorMobileHeaderProps = {
  mobilePanel: EditorMobilePanel;
  onMobilePanelChange: (panel: EditorMobilePanel) => void;
  projectId: string;
  projectName?: string | null;
  statusLabel?: string | null;
  onShare?: () => void;
  onPublish?: () => void;
  publishLabel?: string;
  publishDisabled?: boolean;
  onPreviewRefresh?: () => void;
  previewRefreshDisabled?: boolean;
};

export function EditorMobileHeader({
  mobilePanel,
  onMobilePanelChange,
  projectId,
  projectName,
  statusLabel,
  onShare,
  onPublish,
  publishLabel = "Abrir site",
  publishDisabled = false,
  onPreviewRefresh,
  previewRefreshDisabled = false,
}: EditorMobileHeaderProps) {
  return (
    <div className="forge-mobile-editor-header-inner">
      <div className="forge-mobile-editor-header-row">
        <ForgeLogoMark size={16} linkTo="/projects" title="Todos os projetos" />
        <Link to="/projects/$projectId" params={{ projectId }} className="forge-mobile-project-link">
          <span className="truncate">{projectDisplayName(projectName)}</span>
        </Link>
        <div className="forge-mobile-editor-actions">
          {mobilePanel === "workspace" && onPreviewRefresh && (
            <button
              type="button"
              className="forge-mobile-icon-btn"
              title="Recarregar preview"
              aria-label="Recarregar preview"
              onClick={onPreviewRefresh}
              disabled={previewRefreshDisabled}
            >
              <RefreshCw className="size-4" />
            </button>
          )}
          {onShare && (
            <button
              type="button"
              className="forge-mobile-icon-btn"
              title="Compartilhar"
              aria-label="Compartilhar"
              onClick={onShare}
            >
              <Share2 className="size-4" />
            </button>
          )}
          {onPublish && (
            <button
              type="button"
              className="forge-btn-publish forge-btn-publish--compact"
              onClick={onPublish}
              disabled={publishDisabled}
              title={publishDisabled ? "Aguardando preview ficar pronto" : "Abrir site publicado"}
            >
              {publishLabel}
            </button>
          )}
        </div>
      </div>

      <div className="forge-mobile-editor-toggle-row">
        <EditorMobilePanelToggle value={mobilePanel} onChange={onMobilePanelChange} />
        {statusLabel ? <span className="forge-mobile-status-pill">{statusLabel}</span> : null}
      </div>
    </div>
  );
}