import { Link } from "@tanstack/react-router";
import { Code2, Eye, MessageSquare, RefreshCw, Share2 } from "lucide-react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { projectDisplayName } from "@/lib/project-display-name";

export type EditorMobilePanel = "chat" | "preview" | "code";

type EditorMobileTabBarProps = {
  value: EditorMobilePanel;
  onChange: (value: EditorMobilePanel) => void;
};

const MOBILE_TABS: Array<{
  id: EditorMobilePanel;
  label: string;
  icon: typeof MessageSquare;
}> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Código", icon: Code2 },
];

export function EditorMobileTabBar({ value, onChange }: EditorMobileTabBarProps) {
  return (
    <nav className="forge-mobile-tab-bar" role="tablist" aria-label="Painéis do editor">
      {MOBILE_TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          className="forge-mobile-tab-bar-item"
          data-active={value === id ? "true" : undefined}
          onClick={() => onChange(id)}
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

type EditorMobileHeaderProps = {
  mobilePanel: EditorMobilePanel;
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
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="forge-mobile-project-link"
        >
          <span className="truncate">{projectDisplayName(projectName)}</span>
        </Link>
        {statusLabel ? <span className="forge-mobile-status-pill">{statusLabel}</span> : null}
        <div className="forge-mobile-editor-actions">
          {mobilePanel === "preview" && onPreviewRefresh && (
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
    </div>
  );
}
