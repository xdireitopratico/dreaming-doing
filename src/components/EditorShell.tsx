import { useLocation, Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { sanitizeNext } from "@/lib/sanitize-next";
import { EditorTopBar } from "@/components/editor/EditorTopBar";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";

export function EditorShell({
  children,
  projectName,
  activeView,
  onViewChange,
  onShare,
  onPublish,
  onQuickPrompt,
  onRestartPreview,
  previewBooting,
  running,
}: {
  children: ReactNode;
  projectName?: string;
  activeView: EditorMainView;
  onViewChange: (view: EditorMainView) => void;
  onShare?: () => void;
  onPublish?: () => void;
  onQuickPrompt?: (text: string) => void;
  onRestartPreview?: () => void;
  previewBooting?: boolean;
  running?: boolean;
}) {
  const { user, loading } = useAuth();
  const loc = useLocation();

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
        onQuickPrompt={onQuickPrompt}
        onRestartPreview={onRestartPreview}
        previewBooting={previewBooting}
        running={running}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}