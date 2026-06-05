import { useRef, useState, useEffect } from "react";
import { Github, Database, Cloud, Globe, Plug2 } from "lucide-react";
import { useConnectors, type ConnectorId } from "@/hooks/useConnectors";
import { CONNECTOR_REGISTRY, isConnectorActive } from "@/lib/connectors/registry";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";

const MENU_IDS: ConnectorId[] = ["github", "supabase", "vercel", "netlify", "cloudflare"];

const MENU_ICONS: Record<string, React.ReactNode> = {
  github: <Github className="size-3.5" />,
  supabase: <Database className="size-3.5" />,
  vercel: <Cloud className="size-3.5" />,
  netlify: <Globe className="size-3.5" />,
  cloudflare: <Cloud className="size-3.5" />,
};

export function EditorIntegrationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { status, modes, modal, openConnector, closeModal, saveConnector } = useConnectors();

  const connectedCount = MENU_IDS.filter((id) =>
    isConnectorActive(id, modes[id], status[id]),
  ).length;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          className="forge-view-icon-tab"
          data-active={open}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          title={`Integrações (${connectedCount}/${MENU_IDS.length} conectadas)`}
        >
          <Plug2 className="size-4" />
          {connectedCount > 0 && (
            <span className="forge-integrations-badge">{connectedCount}</span>
          )}
        </button>

        {open && (
          <div className="absolute top-full left-0 z-50 mt-1 min-w-[200px] rounded-lg border border-[var(--forge-border-strong)] bg-[var(--forge-surface-2)] py-1 shadow-xl">
            {MENU_IDS.map((id) => {
              const entry = CONNECTOR_REGISTRY[id];
              const active = isConnectorActive(id, modes[id], status[id]);
              return (
                <button
                  key={id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--forge-surface-3)]"
                  onClick={() => {
                    openConnector(id);
                    setOpen(false);
                  }}
                >
                  <span
                    className="grid size-7 place-items-center rounded-md border border-[var(--forge-border)]"
                    data-connected={active ? "true" : undefined}
                  >
                    {MENU_ICONS[id]}
                  </span>
                  <span className="flex-1 font-mono text-[10px] text-[var(--forge-silver)]">{entry.name}</span>
                  <span
                    className={`size-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-[var(--forge-muted)]"}`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

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