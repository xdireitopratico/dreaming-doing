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
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { EditorMainView } from "@/components/editor/EditorViewTabs";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { EditorConnectorModal } from "@/components/editor/EditorConnectorModal";
import {
  useEditorConnectors,
  type ConnectorId,
} from "@/hooks/useEditorConnectors";

interface EditorTopBarProps {
  projectName?: string;
  activeView: EditorMainView;
  onViewChange: (view: EditorMainView) => void;
  onShare?: () => void;
  onPublish?: () => void;
  onQuickPrompt?: (text: string) => void;
  running?: boolean;
}

function ConnectorButton({
  id,
  title,
  connected,
  onClick,
  children,
}: {
  id: ConnectorId;
  title: string;
  connected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="forge-connector-btn"
      title={connected ? `${title} — conectado` : `${title} — conectar`}
      data-connected={connected ? "true" : undefined}
      data-connector={id}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function EditorTopBar({
  projectName,
  activeView,
  onViewChange,
  onShare,
  onPublish,
  onQuickPrompt,
  running,
}: EditorTopBarProps) {
  const { user } = useAuth();
  const { status, modal, openConnector, closeModal, saveConnector } = useEditorConnectors();

  const initials =
    user?.email?.slice(0, 2).toUpperCase() ??
    user?.user_metadata?.full_name?.slice(0, 2)?.toUpperCase() ??
    "U";

  return (
    <>
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
              className="forge-voc-chip"
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

          <span className="forge-topbar-divider mx-1" aria-hidden />

          <ConnectorButton
            id="github"
            title="GitHub"
            connected={status.github.connected}
            onClick={() => openConnector("github")}
          >
            <Github className="size-4" />
          </ConnectorButton>
          <ConnectorButton
            id="supabase"
            title="Supabase"
            connected={status.supabase.connected}
            onClick={() => openConnector("supabase")}
          >
            <Database className="size-4" />
          </ConnectorButton>
          <ConnectorButton
            id="vercel"
            title="Vercel"
            connected={status.vercel.connected}
            onClick={() => openConnector("vercel")}
          >
            <Cloud className="size-4" />
          </ConnectorButton>
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

      <EditorConnectorModal
        connector={modal}
        status={modal ? status[modal] : null}
        onClose={closeModal}
        onSave={saveConnector}
      />
    </>
  );
}