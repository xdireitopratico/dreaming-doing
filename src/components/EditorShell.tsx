import { useLocation, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { clearForgeTransitionOverlays } from "@/lib/clear-forge-overlays";
import { sanitizeNext } from "@/lib/sanitize-next";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import type { EditorIntegrationsMenuProps } from "@/components/editor/EditorIntegrationsMenu";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";

export function EditorShell({
  children,
  projectName,
  activeView,
  onViewChange,
  onShare,
  onPublish,
  running,
  previewFiles,
  previewPath,
  onPreviewPathChange,
  previewDevUrl,
  onPreviewRefresh,
  integrations,
}: {
  children: ReactNode;
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
}) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  useEffect(() => {
    clearForgeTransitionOverlays();
  }, []);

  if (loading) {
    return (
      <div className="editor-workspace grid h-screen place-items-center">
        <Loader2 className="size-5 animate-spin text-[var(--forge-primary)]" />
      </div>
    );
  }

  if (!user) {
    const next = sanitizeNext(loc.pathname);
    return <Navigate to="/auth" search={{ next }} replace />;
  }

  return (
    <div className="editor-workspace flex h-screen flex-col overflow-hidden">
      <EditorTopBar
        projectName={projectName}
        activeView={activeView}
        onViewChange={onViewChange}
        onShare={onShare}
        onPublish={onPublish}
        running={running}
        previewFiles={previewFiles}
        previewPath={previewPath}
        onPreviewPathChange={onPreviewPathChange}
        previewDevUrl={previewDevUrl}
        onPreviewRefresh={onPreviewRefresh}
        integrations={integrations}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}