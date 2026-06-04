import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Key } from "lucide-react";
import { useConnectors } from "@/hooks/useConnectors";
import { CONNECTORS_PAGE_LIST, isConnectorActive } from "@/lib/connectors/registry";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";

export function SetupRail() {
  const [open, setOpen] = useState(false);
  const { status, modes, setMode, modal, openConnector, closeModal, saveConnector, trialMessagesRemaining } =
    useConnectors();

  const items = CONNECTORS_PAGE_LIST.map((entry) => ({
    id: entry.id as ConnectorId,
    name: entry.name,
    done: isConnectorActive(entry.id as ConnectorId, modes[entry.id as ConnectorId], status[entry.id as ConnectorId]),
  }));

  const doneCount = items.filter((i) => i.done).length;

  return (
    <>
      <div className="forge-setup-rail shrink-0 border-t border-[var(--forge-border)] bg-[var(--forge-surface-2)]/90">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--forge-surface-3)] transition-colors"
        >
          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--forge-muted)]">
            Setup · {doneCount}/{items.length}
          </span>
          <span className="flex items-center gap-2">
            {trialMessagesRemaining > 0 && (
              <span className="font-mono text-[8px] text-[var(--forge-ghost)]">
                trial {trialMessagesRemaining}
              </span>
            )}
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </span>
        </button>

        {open && (
          <div className="px-3 pb-3">
            <ul className="space-y-1">
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
                  to="/api-keys"
                  className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--forge-surface-3)] transition-colors"
                >
                  <Key className="size-3.5 text-[var(--forge-primary)] shrink-0" />
                  <span className="flex-1 font-mono text-[10px] text-[var(--forge-silver)]">API Keys</span>
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
        mode={modal ? modes[modal] : "forge"}
        variant="editor"
        onClose={closeModal}
        onSave={saveConnector}
        onModeChange={modal ? (m) => setMode(modal, m) : () => {}}
      />
    </>
  );
}