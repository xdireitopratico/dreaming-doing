import { Github, Database, Cloud, Globe, Plug2 } from "lucide-react";
import { useConnectors, type ConnectorId } from "@/hooks/useConnectors";
import { CONNECTOR_REGISTRY, isConnectorActive } from "@/lib/connectors/registry";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MENU_IDS: ConnectorId[] = ["github", "supabase", "vercel", "netlify", "cloudflare"];

const MENU_ICONS: Record<string, React.ReactNode> = {
  github: <Github className="size-3.5" />,
  supabase: <Database className="size-3.5" />,
  vercel: <Cloud className="size-3.5" />,
  netlify: <Globe className="size-3.5" />,
  cloudflare: <Cloud className="size-3.5" />,
};

export function EditorIntegrationsMenu() {
  const { status, modes, modal, openConnector, closeModal, saveConnector } = useConnectors();

  const connectedCount = MENU_IDS.filter((id) =>
    isConnectorActive(id, modes[id], status[id]),
  ).length;

  return (
    <>
      <DropdownMenu>
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
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={6}
          className="forge-dropdown-panel z-[200] min-w-[200px] border-[var(--forge-border-strong)] !bg-[var(--forge-surface-2)] p-1 !text-[var(--forge-text)]"
        >
          {MENU_IDS.map((id) => {
            const entry = CONNECTOR_REGISTRY[id];
            const active = isConnectorActive(id, modes[id], status[id]);
            return (
              <DropdownMenuItem
                key={id}
                className="forge-dropdown-item flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 focus:bg-[var(--forge-surface-3)]"
                onClick={() => openConnector(id)}
              >
                <span
                  className="grid size-7 place-items-center rounded-md border border-[var(--forge-border)]"
                  data-connected={active ? "true" : undefined}
                >
                  {MENU_ICONS[id]}
                </span>
                <span className="flex-1 font-mono text-[10px] text-[var(--forge-silver)]">
                  {entry.name}
                </span>
                <span
                  className={`size-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-[var(--forge-muted)]"}`}
                />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
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