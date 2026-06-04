import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, ChevronRight, Key } from "lucide-react";
import { useConnectors } from "@/hooks/useConnectors";
import { CONNECTORS_PAGE_LIST, isConnectorActive } from "@/lib/connectors/registry";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";

export function SetupRail() {
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
      <aside className="forge-setup-rail border-t border-[var(--forge-border)] bg-[var(--forge-surface-2)]/80 px-3 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--forge-muted)]">
            Configuração · {doneCount}/{items.length}
          </span>
          <Link
            to="/connectors"
            className="font-mono text-[9px] text-[var(--forge-primary)] hover:underline"
          >
            Avançado
          </Link>
        </div>
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
                <ChevronRight className="size-3 text-[var(--forge-muted)]" />
              </button>
            </li>
          ))}
          <li>
            <Link
              to="/api-keys"
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--forge-surface-3)] transition-colors"
            >
              <Key className="size-3.5 text-[var(--forge-primary)] shrink-0" />
              <span className="flex-1 font-mono text-[10px] text-[var(--forge-silver)]">API Keys (IA / voz)</span>
              <ChevronRight className="size-3 text-[var(--forge-muted)]" />
            </Link>
          </li>
        </ul>
        {trialMessagesRemaining > 0 ? (
          <p className="mt-2 font-mono text-[9px] text-[var(--forge-muted)] leading-relaxed">
            Tira-gosto: {trialMessagesRemaining} mensagem(ns) com infra FORGE.
          </p>
        ) : (
          <p className="mt-2 font-mono text-[9px] text-amber-400/90 leading-relaxed">
            Limite do tira-gosto. Configure API Keys para continuar.
          </p>
        )}
      </aside>

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