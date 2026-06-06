import { Code2, Eye, Moon, RefreshCw, Share2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";
import {
  EditorIntegrationsMenu,
  type EditorIntegrationsMenuProps,
} from "@/components/editor/EditorIntegrationsMenu";
import { PreviewRouteNav } from "@/components/editor/PreviewRouteNav";
import {
  previewDeviceWidth,
  type PreviewDevice,
} from "@/components/editor/PreviewViewportChrome";
import { Monitor, Smartphone, Tablet } from "lucide-react";

interface EditorWorkspaceHeaderProps {
  activeView: EditorMainView;
  onViewChange: (view: EditorMainView) => void;
  onShare?: () => void;
  onPublish?: () => void;
  integrations?: EditorIntegrationsMenuProps;
  /** Preview navigation controls — only rendered when activeView === "preview". */
  preview?: {
    files: Array<{ path: string; content?: string }>;
    activePath: string;
    onNavigate: (path: string) => void;
    devUrl?: string | null;
    onRefresh?: () => void;
    device: PreviewDevice;
    onDeviceChange: (device: PreviewDevice) => void;
  };
}

const DEVICES: Array<{ id: PreviewDevice; label: string; icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

export function EditorWorkspaceHeader({
  activeView,
  onViewChange,
  onShare,
  onPublish,
  integrations,
  preview,
}: EditorWorkspaceHeaderProps) {
  const { user } = useAuth();

  const initials =
    user?.email?.slice(0, 2).toUpperCase() ??
    user?.user_metadata?.full_name?.slice(0, 2)?.toUpperCase() ??
    "U";

  const showPreviewControls = activeView === "preview" && preview;

  return (
    <div className="forge-workspace-header-inner">
      <div className="forge-workspace-header-tools">
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

        <span className="forge-topbar-divider mx-1 shrink-0" aria-hidden />
        <EditorIntegrationsMenu {...integrations} />
      </div>

      {showPreviewControls ? (
        <div className="forge-workspace-header-center">
          <div className="forge-preview-device-toggle" role="group" aria-label="Tamanho do preview">
            {DEVICES.map(({ id, label, icon: Icon }) => {
              const active = preview!.device === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={label}
                  aria-pressed={active}
                  className="forge-preview-device-btn"
                  data-active={active}
                  onClick={() => preview!.onDeviceChange(id)}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>

          <div className="forge-workspace-header-url">
            <PreviewRouteNav
              variant="chrome"
              files={preview!.files}
              activePath={preview!.activePath}
              onNavigate={preview!.onNavigate}
              devUrl={preview!.devUrl}
            />
          </div>

          <button
            type="button"
            className="forge-preview-refresh-btn forge-preview-refresh-btn--dark"
            title="Recarregar página"
            onClick={preview!.onRefresh}
            disabled={!preview!.onRefresh}
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="forge-workspace-header-center" aria-hidden />
      )}

      <div className="forge-workspace-header-actions">
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
    </div>
  );
}

// Re-export so route doesn't need to also import PreviewViewportChrome
export { previewDeviceWidth };
export type { PreviewDevice };
