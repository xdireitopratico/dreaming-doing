import { Code2, Eye, Moon, RefreshCw, Share2, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useEditorTheme } from "@/lib/editor-theme";
import type { EditorMainView } from "@/components/editor/editor-views";
import {
  EditorIntegrationsMenu,
  type EditorIntegrationsMenuProps,
} from "@/components/editor/EditorIntegrationsMenu";
import { PreviewRouteNav } from "@/components/editor/PreviewRouteNav";
import { previewDeviceWidth, type PreviewDevice } from "@/components/editor/PreviewViewportChrome";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { SessionKindBadge } from "@/components/editor/SessionKindBadge";
import {
  InspectorNavControls,
  type InspectorNavControlsProps,
} from "@/components/editor/InspectorNavControls";

interface EditorWorkspaceHeaderProps {
  activeView: EditorMainView;
  onViewChange: (view: EditorMainView) => void;
  onShare?: () => void;
  onPublish?: () => void;
  publishLabel?: string;
  publishDisabled?: boolean;
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
  e2bConnected?: boolean;
  previewStatusLabel?: string | null;
  jobInspectorActive?: boolean;
  /** Aba Plan aberta: nav do inspector no header; chrome do preview some. */
  inspectorPlanNav?: InspectorNavControlsProps;
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
  publishLabel = "Abrir site",
  publishDisabled = false,
  integrations,
  preview,
  e2bConnected = false,
  previewStatusLabel,
  jobInspectorActive = false,
  inspectorPlanNav,
}: EditorWorkspaceHeaderProps) {
  const { user } = useAuth();
  const { theme: editorTheme, toggle: toggleEditorTheme } = useEditorTheme();

  const initials =
    user?.email?.slice(0, 2).toUpperCase() ??
    user?.user_metadata?.full_name?.slice(0, 2)?.toUpperCase() ??
    "U";

  const showPreviewControls = activeView === "preview" && preview && !jobInspectorActive;

  if (inspectorPlanNav) {
    return (
      <div className="forge-workspace-header-inner forge-workspace-header-inner--inspector-plan">
        <InspectorNavControls {...inspectorPlanNav} />
      </div>
    );
  }

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
        <EditorIntegrationsMenu {...integrations} e2bConnected={e2bConnected} />
        {previewStatusLabel && activeView === "preview" && (
          <span className="forge-preview-status-pill">{previewStatusLabel}</span>
        )}
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
        <SessionKindBadge />
        <button
          type="button"
          className="forge-connector-btn"
          title="Tema"
          onClick={toggleEditorTheme}
          aria-label={editorTheme === "default" ? "Mudar para tema legacy" : "Mudar para tema padrão"}
        >
          {editorTheme === "default" ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>
        <button
          type="button"
          className="forge-btn-share flex items-center gap-1.5"
          onClick={onShare}
        >
          <Share2 className="size-3.5" />
        </button>
        <button
          type="button"
          className="forge-btn-publish"
          onClick={onPublish}
          disabled={publishDisabled || !onPublish}
          title={publishDisabled ? "Aguardando preview ficar pronto" : "Abrir site publicado"}
        >
          {publishLabel}
        </button>
      </div>
    </div>
  );
}

// Re-export so route doesn't need to also import PreviewViewportChrome
export { previewDeviceWidth };
export type { PreviewDevice };
