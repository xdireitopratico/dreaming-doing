// Integrações de plataforma: GitHub, Supabase, Vercel, Cloudflare, E2B (separado de API Keys)
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Plug, Shield, CheckCircle2, Key } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PlatformConnectorCard } from "@/components/connectors/PlatformConnectorCard";
import { ConnectorGuideModal } from "@/components/connectors/ConnectorGuideModal";
import { useConnectors } from "@/hooks/useConnectors";
import { CONNECTORS_PAGE_LIST, isConnectorActive } from "@/lib/connectors/registry";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";

export const Route = createFileRoute("/connectors")({
  component: () => (
    <DashboardShell requireAuth activeNav="connectors">
      <ConnectorsPage />
    </DashboardShell>
  ),
});

function ConnectorsPage() {
  const { status, modes, setMode, modal, openConnector, closeModal, saveConnector } = useConnectors();

  const activeCount = CONNECTORS_PAGE_LIST.filter((p) =>
    isConnectorActive(p.id, modes[p.id], status[p.id]),
  ).length;

  return (
    <div className="px-6 py-8 max-w-[960px] mx-auto">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors mb-6"
      >
        <ArrowLeft className="size-3" />
        PROJETOS
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <Plug className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Conectores</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5">
              GitHub, Supabase, Vercel, Cloudflare e sandbox — não confundir com chaves de IA
            </p>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center gap-4 mb-6 px-4 py-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-400" />
          <span className="font-mono text-[10px]">{activeCount} integração(ões) operacional(is)</span>
        </div>
        <span className="text-[var(--border)]">|</span>
        <Link to="/api-keys" className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--primary)] hover:underline">
          <Key className="size-3" />
          Chaves de IA (API Keys) →
        </Link>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
        <h2 className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--text-dim)] mb-4">
          Plataformas
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CONNECTORS_PAGE_LIST.map((p) => (
            <PlatformConnectorCard
              key={p.id}
              id={p.id as ConnectorId}
              status={status[p.id as ConnectorId]}
              mode={modes[p.id as ConnectorId]}
              onModeChange={(m) => setMode(p.id as ConnectorId, m)}
              onConfigure={() => openConnector(p.id as ConnectorId)}
            />
          ))}
        </div>
      </motion.div>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-12 pt-6 border-t border-[var(--border)] flex items-center justify-between flex-wrap gap-3"
      >
        <div className="flex items-center gap-1.5">
          <Shield className="size-3 text-[var(--text-ghost)]" />
          <span className="font-mono text-[9px] text-[var(--text-ghost)]">
            Tokens ficam cifrados no servidor — nunca no navegador.
          </span>
        </div>
        <Link to="/api-keys" className="font-mono text-[9px] text-[var(--primary)] hover:underline">
          Configurar modelos de IA →
        </Link>
      </motion.footer>

      <ConnectorGuideModal
        connector={modal}
        status={modal ? status[modal] : null}
        mode={modal ? modes[modal] : "forge"}
        variant="dashboard"
        onClose={closeModal}
        onSave={saveConnector}
        onModeChange={modal ? (m) => setMode(modal, m) : () => {}}
      />
    </div>
  );
}