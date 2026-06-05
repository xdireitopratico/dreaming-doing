import { Github, Database, Cloud, Globe, Plug2 } from "lucide-react";
import { useConnectors, type ConnectorId, type ConnectorStatus } from "@/hooks/useConnectors";
import { CONNECTOR_REGISTRY, isConnectorActive } from "@/lib/connectors/registry";
import type { IntegrationPrefs } from "@/lib/connectors/integration-prefs";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ForgeEditorDropdownContent,
  ForgeEditorDropdownItem,
} from "@/components/editor/ForgeEditorDropdown";

const MENU_IDS: ConnectorId[] = ["github", "supabase", "vercel", "netlify", "cloudflare"];

const MENU_ICONS: Record<string, React.ReactNode> = {
  github: <Github className="size-3.5" />,
  supabase: <Database className="size-3.5" />,
  vercel: <Cloud className="size-3.5" />,
  netlify: <Globe className="size-3.5" />,
  cloudflare: <Cloud className="size-3.5" />,
};

export interface EditorIntegrationsMenuProps {
  status: Record<ConnectorId, ConnectorStatus>;
  modes: IntegrationPrefs;
  modal: ConnectorId | null;
  openConnector: (id: ConnectorId) => void;
  closeModal: () => void;
  saveConnector: (
    kind: ConnectorId,
    payload: { token?: string; meta?: Record<string, unknown>; disconnect?: boolean },
  ) => Promise<void>;
}

export function EditorIntegrationsMenu(props?: Partial<EditorIntegrationsMenuProps>) {
  const internal = useConnectors();
  const status = props?.status ?? internal.status;
  const modes = props?.modes ?? internal.modes;
  const modal = props?.modal ?? internal.modal;
  const openConnector = props?.openConnector ?? internal.openConnector;
  const closeModal = props?.closeModal ?? internal.closeModal;
  const saveConnector = props?.saveConnector ?? internal.saveConnector;

  const connectedCount = MENU_IDS.filter((id) =>
    isConnectorActive(id, modes[id], status[id]),
  ).length;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="forge-view-icon-tab"
            title={`Integrações (${connectedCount}/${MENU_IDS.length} conectadas)`}
          >
            <Plug2 className="size-4" />
            {connectedCount > 0 && (
              <span className="forge-integrations-badge">{connectedCount}</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <ForgeEditorDropdownContent align="start" side="bottom" sideOffset={6} className="min-w-[200px]">
          {MENU_IDS.map((id) => {
            const entry = CONNECTOR_REGISTRY[id];
            const active = isConnectorActive(id, modes[id], status[id]);
            return (
              <ForgeEditorDropdownItem
                key={id}
                className="flex items-center gap-2 px-2 py-2"
                onSelect={() => openConnector(id)}
              >
                <span
                  className="grid size-7 place-items-center rounded-md border border-[var(--forge-border)]"
                  data-connected={active ? "true" : undefined}
                >
                  {MENU_ICONS[id]}
                </span>
                <span className="flex-1 font-mono text-[10px]">{entry.name}</span>
                <span
                  className={`size-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-[var(--forge-muted)]"}`}
                />
              </ForgeEditorDropdownItem>
            );
          })}
        </ForgeEditorDropdownContent>
      </DropdownMenu>

      <ConnectorGuideModal
        connector={modal}
        status={modal ? status[modal] : null}
        variant="editor"
        onClose={closeModal}
        onSave={saveConnector}
      />
    </>
  );
}