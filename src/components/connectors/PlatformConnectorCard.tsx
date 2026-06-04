import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { ConnectorId, ConnectorStatus, IntegrationMode } from "@/hooks/useConnectors";
import { CONNECTOR_REGISTRY, isConnectorActive } from "@/lib/connectors/registry";
import { ConnectorModeToggle } from "@/components/connectors/ConnectorModeToggle";

export function PlatformConnectorCard({
  id,
  status,
  mode,
  onModeChange,
  onConfigure,
}: {
  id: ConnectorId;
  status: ConnectorStatus;
  mode: IntegrationMode;
  onModeChange: (mode: IntegrationMode) => void;
  onConfigure: () => void;
}) {
  const entry = CONNECTOR_REGISTRY[id];
  const isActive = isConnectorActive(id, mode, status);

  return (
    <motion.div
      layout
      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 hover:bg-[var(--surface-1)] transition-colors"
    >
      <div className="flex items-start gap-3">
        <div
          className={`size-11 rounded-lg border grid place-items-center shrink-0 font-mono text-[10px] ${
            isActive
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-ghost)]"
          }`}
        >
          {entry.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] text-[var(--foreground)]">{entry.name}</span>
            {isActive ? (
              <span className="inline-flex items-center gap-1 font-mono text-[8px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-400/10">
                <CheckCircle2 className="size-3" />
                ATIVO
              </span>
            ) : (
              <span className="font-mono text-[8px] text-[var(--text-ghost)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                CONFIGURAR
              </span>
            )}
          </div>
          {status.label && (
            <p className="font-mono text-[9px] text-[var(--primary)] mt-0.5">{status.label}</p>
          )}
          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed">
            {entry.description}
          </p>

          <ConnectorModeToggle
            id={id}
            mode={mode}
            forgeAvailable={status.forgeAvailable}
            onModeChange={onModeChange}
          />
        </div>
        <button
          type="button"
          onClick={onConfigure}
          className="shrink-0 p-1 text-[var(--text-ghost)] hover:text-[var(--foreground)]"
          title="Configurar"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {mode === "forge" && status.forgeAvailable && id !== "cloudflare" && (
        <p className="mt-3 ml-14 font-mono text-[8px] text-[var(--text-ghost)] leading-relaxed">
          Infraestrutura FORGE — comece sem criar contas externas. Você pode migrar para &quot;Meu {entry.name}&quot;
          quando quiser independência total.
        </p>
      )}
    </motion.div>
  );
}