import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Key, Sparkles, Plug2, X } from "lucide-react";
import { useConnectors } from "@/hooks/useConnectors";
import { CONNECTORS_PAGE_LIST, isConnectorActive } from "@/lib/connectors/registry";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";
import { OPEN_CONNECTOR_EVENT } from "@/hooks/useTasteUiActions";
import { ActiveModelBadge } from "@/components/editor/ActiveModelBadge";
import { loadAgentPreferences, type AgentPreferences } from "@/lib/agent-preferences";
import { buildEditorReadiness } from "@/lib/editor-readiness";

type SetupRailProps = {
  checklist?: React.ReactNode;
  hasUserLlmKey?: boolean;
  e2bConnected?: boolean;
  prefs?: AgentPreferences;
  connectorRows?: Array<{
    kind: string | null;
    provider?: string | null;
    meta?: Record<string, unknown> | null;
  }>;
};

type Section = "trilha" | "modelo" | "integracoes";

export function SetupRail({
  checklist,
  hasUserLlmKey = false,
  e2bConnected = false,
  prefs,
  connectorRows,
}: SetupRailProps) {
  const resolvedPrefs = prefs ?? loadAgentPreferences();
  const readinessItems = buildEditorReadiness({
    hasUserLlmKey,
    e2bConnected,
    prefs: resolvedPrefs,
    connectorRows,
  });
  const hasReadinessIssues = readinessItems.some((i) => i.level !== "ok");
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section>(hasReadinessIssues ? "trilha" : "integracoes");
  const {
    status,
    modes,
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

  // Close on Escape when overlay is open
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const items = CONNECTORS_PAGE_LIST.map((entry) => ({
    id: entry.id as ConnectorId,
    name: entry.name,
    done: isConnectorActive(entry.id as ConnectorId, modes[entry.id as ConnectorId], status[entry.id as ConnectorId]),
  }));

  const doneCount = items.filter((i) => i.done).length;

  return (
    <>
      {/* Compact bar at bottom of chat — always visible */}
      <div className="forge-setup-rail">
        <button
          type="button"
          onClick={() => setOpen(true)}
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
            <ChevronUp className="size-3.5" />
          </span>
        </button>
      </div>

      {/* Full-chat overlay when open */}
      {open && (
        <div className="forge-setup-overlay" role="dialog" aria-label="Setup do projeto">
          <header className="forge-setup-overlay-header">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--forge-primary)]" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--forge-silver)]">
                Setup do projeto
              </span>
              <span className="font-mono text-[9px] text-[var(--forge-muted)]">
                {doneCount}/{items.length} integrações
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="forge-setup-overlay-close"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </header>

          <nav className="forge-setup-overlay-tabs" role="tablist">
            <SectionTab id="trilha" active={section} onSelect={setSection} label="Trilha" />
            <SectionTab id="modelo" active={section} onSelect={setSection} label="Modelo & API" />
            <SectionTab id="integracoes" active={section} onSelect={setSection} label="Integrações" />
          </nav>

          <div className="forge-setup-overlay-body">
            {section === "trilha" && (
              <section className="space-y-4">
                {checklist}
                <ReadinessList items={readinessItems} />
              </section>
            )}

            {section === "modelo" && (
              <section className="space-y-4">
                <div className="forge-setup-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="size-3.5 text-[var(--forge-primary)]" />
                    <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--forge-text)]">
                      Modelo ativo
                    </h3>
                  </div>
                  <ActiveModelBadge />
                  <p className="mt-3 text-[11px] text-[var(--forge-muted)] leading-relaxed">
                    Configure provedor, modelo e BYOK em uma única tela.
                  </p>
                  <Link
                    to="/models"
                    className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
                  >
                    Abrir Modelos →
                  </Link>
                </div>

                <div className="forge-setup-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="size-3.5 text-[var(--forge-primary)]" />
                    <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--forge-text)]">
                      Chaves de API
                    </h3>
                  </div>
                  <p className="text-[11px] text-[var(--forge-muted)] leading-relaxed">
                    Status BYOK: <strong className="text-[var(--forge-silver)]">{hasUserLlmKey ? "configurado" : "ainda não configurado"}</strong>
                  </p>
                  <Link
                    to="/api"
                    className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
                  >
                    Abrir API Keys →
                  </Link>
                </div>
              </section>
            )}

            {section === "integracoes" && (
              <section className="space-y-3">
                <div className="forge-setup-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Plug2 className="size-3.5 text-[var(--forge-primary)]" />
                    <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--forge-text)]">
                      Conectores
                    </h3>
                  </div>
                  <ul className="space-y-1">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => openConnector(item.id)}
                          className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-[var(--forge-surface-3)] transition-colors"
                        >
                          {item.done ? (
                            <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="size-3.5 text-[var(--forge-muted)] shrink-0" />
                          )}
                          <span className="flex-1 font-mono text-[11px] text-[var(--forge-silver)]">
                            {item.name}
                          </span>
                          <span className="font-mono text-[9px] text-[var(--forge-ghost)]">
                            {item.done ? "conectado" : "configurar"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  to="/connectors"
                  className="inline-block font-mono text-[10px] text-[var(--forge-primary)] hover:underline"
                >
                  Configuração avançada →
                </Link>
              </section>
            )}
          </div>
        </div>
      )}

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

function SectionTab({
  id,
  active,
  onSelect,
  label,
}: {
  id: Section;
  active: Section;
  onSelect: (s: Section) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      data-active={active === id}
      className="forge-setup-overlay-tab"
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );
}

function ReadinessList({
  items,
}: {
  items: ReturnType<typeof buildEditorReadiness>;
}) {
  if (!items.length) return null;
  return (
    <div className="forge-setup-card">
      <h3 className="font-mono text-[11px] uppercase tracking-wider text-[var(--forge-text)] mb-2">
        Prontidão do agente
      </h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            {item.level === "ok" ? (
              <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Circle className="size-3.5 text-[var(--forge-muted)] shrink-0 mt-0.5" />
            )}
            <span className="flex-1 text-[11px] text-[var(--forge-silver)] leading-relaxed">
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
