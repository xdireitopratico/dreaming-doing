import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Key } from "lucide-react";
import { useConnectors } from "@/hooks/useConnectors";
import { CONNECTORS_PAGE_LIST, isConnectorActive } from "@/lib/connectors/registry";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";
import { OPEN_CONNECTOR_EVENT } from "@/hooks/useTasteUiActions";
import { ActiveModelBadge } from "@/components/editor/ActiveModelBadge";

type SetupRailProps = {
  checklist?: React.ReactNode;
};

export function SetupRail({ checklist }: SetupRailProps) {
  const [open, setOpen] = useState(false);
  const {
    status,
    modes,
    setMode,
    modal,
    openConnector,
    closeModal,
    saveConnector,
    tasteChatRemaining,
  } = useConnectors();

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const { connector } = (ev as CustomEvent<{ connector: ConnectorId }>).detail;
      if (connector) openConnector(connector);
    };
    window.addEventListener(OPEN_CONNECTOR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONNECTOR_EVENT, onOpen);
  }, [openConnector]);

  const items = CONNECTORS_PAGE_LIST.map((entry) => ({
    id: entry.id as ConnectorId,
    name: entry.name,
    done: isConnectorActive(entry.id as ConnectorId, modes[entry.id as ConnectorId], status[entry.id as ConnectorId]),
  }));

  const doneCount = items.filter((i) => i.done).length;

  return (
    <>
      <div className={`forge-setup-rail${open ? " forge-setup-rail--open" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="forge-setup-rail-toggle w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--forge-surface-3)] transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--forge-muted)] shrink-0">
              Setup · {doneCount}/{items.length}
            </span>
            <ActiveModelBadge />
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {tasteChatRemaining > 0 && (
              <span className="font-mono text-[8px] text-[var(--forge-ghost)]">
                taste {tasteChatRemaining}
              </span>
            )}
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </span>
        </button>

        {open && (
          <div className="forge-setup-rail-body px-3 pb-3">
            {checklist}
            <ul className="space-y-1 mt-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openConnector(item.id)}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-[var(--forge-surface-3)] transition-colors"
                  >
                    {item.done ? (
                      <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="size-3.5 text-[var(--forge-muted)] shrink-0" />
                    )}
                    <span className="flex-1 font-mono text-[10px] text-[var(--forge-silver)]">{item.name}</span>
                  </button>
                </li>
              ))}
              <li>
                <Link
                  to="/api"
                  className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--forge-surface-3)] transition-colors"
                >
                  <Key className="size-3.5 text-[var(--forge-primary)] shrink-0" />
                  <span className="flex-1 font-mono text-[10px] text-[var(--forge-silver)]">API</span>
                </Link>
              </li>
            </ul>
            <Link
              to="/connectors"
              className="mt-2 inline-block font-mono text-[9px] text-[var(--forge-primary)] hover:underline"
            >
              Configuração avançada →
            </Link>
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