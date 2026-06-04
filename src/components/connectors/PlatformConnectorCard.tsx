import { motion } from "framer-motion";
import { CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import type { PlatformConnectorId, IntegrationMode, PlatformConnectorStatus } from "@/hooks/usePlatformConnectors";

export function PlatformConnectorCard({
  id,
  name,
  description,
  icon,
  status,
  mode,
  onModeChange,
  onConfigure,
}: {
  id: PlatformConnectorId;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: PlatformConnectorStatus;
  mode: IntegrationMode;
  onModeChange: (mode: IntegrationMode) => void;
  onConfigure: () => void;
}) {
  const forgeActive = mode === "forge" && status.forgeAvailable;
  const ownActive = mode === "own" && status.connected;
  const isActive = forgeActive || ownActive;

  return (
    <motion.div
      layout
      className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 hover:bg-[var(--surface-1)] transition-colors"
    >
      <div className="flex items-start gap-3">
        <div
          className={`size-11 rounded-lg border grid place-items-center shrink-0 ${
            isActive
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
              : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-ghost)]"
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] text-[var(--foreground)]">{name}</span>
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
          <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed">{description}</p>

          <div className="flex gap-1 mt-3 p-0.5 rounded-md bg-[var(--surface-2)]/80 border border-[var(--border)] w-fit">
            <button
              type="button"
              onClick={() => onModeChange("forge")}
              disabled={!status.forgeAvailable}
              className={`px-2.5 py-1 rounded font-mono text-[8px] transition-colors ${
                mode === "forge"
                  ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                  : "text-[var(--text-ghost)] hover:text-[var(--foreground)]"
              } ${!status.forgeAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-2.5" />
                FORGE
              </span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange("own")}
              className={`px-2.5 py-1 rounded font-mono text-[8px] transition-colors ${
                mode === "own"
                  ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                  : "text-[var(--text-ghost)] hover:text-[var(--foreground)]"
              }`}
            >
              Meu {name}
            </button>
          </div>
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
          Integração gerenciada pelo FORGE neste ambiente — basta fazer vibe code; deploy e backend já estão
          ligados ao projeto <code className="text-[var(--text-dim)]">dreaming-doing</code>.
        </p>
      )}
    </motion.div>
  );
}