// Integrações de plataforma: GitHub, Supabase, Vercel, Cloudflare (separado de API Keys)
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Cloud, Database, GitBranch, Plug, Shield, CheckCircle2, Key } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PlatformConnectorCard } from "@/components/connectors/PlatformConnectorCard";
import { PlatformConnectorModal } from "@/components/connectors/PlatformConnectorModal";
import { usePlatformConnectors } from "@/hooks/usePlatformConnectors";

export const Route = createFileRoute("/connectors")({
  component: () => (
    <DashboardShell requireAuth activeNav="connectors">
      <ConnectorsPage />
    </DashboardShell>
  ),
});

const PLATFORMS = [
  {
    id: "github" as const,
    name: "GitHub",
    desc: "Importação de repos, sincronização e deploy via push. FORGE já aponta para xdireitopratico/dreaming-doing.",
    icon: <GitBranch className="size-5" />,
  },
  {
    id: "supabase" as const,
    name: "Supabase",
    desc: "Banco, auth, Realtime e Edge Functions. Projeto canônico FORGE ou instância própria.",
    icon: <Database className="size-5" />,
  },
  {
    id: "vercel" as const,
    name: "Vercel",
    desc: "Preview e produção. FORGE usa dreaming-doing.vercel.app; conecte o seu token para outro projeto.",
    icon: <Cloud className="size-5" />,
  },
  {
    id: "cloudflare" as const,
    name: "Cloudflare Pages",
    desc: "Deploy em edge global. Conecte sua conta — integração FORGE em breve.",
    icon: <Cloud className="size-5" />,
  },
];

function ConnectorsPage() {
  const { status, modes, setMode, modal, openConnector, closeModal, saveConnector } =
    usePlatformConnectors();

  const activeCount = PLATFORMS.filter((p) => {
    const s = status[p.id];
    const mode = modes[p.id];
    return (mode === "forge" && s.forgeAvailable) || (mode === "own" && s.connected);
  }).length;

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
              GitHub, Supabase, Vercel e Cloudflare — não confundir com chaves de IA
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
          {PLATFORMS.map((p) => (
            <PlatformConnectorCard
              key={p.id}
              id={p.id}
              name={p.name}
              description={p.desc}
              icon={p.icon}
              status={status[p.id]}
              mode={modes[p.id]}
              onModeChange={(m) => setMode(p.id, m)}
              onConfigure={() => openConnector(p.id)}
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
            Tokens de plataforma ficam na tabela connectors (Supabase) — nunca no código do cliente.
          </span>
        </div>
        <Link to="/api-keys" className="font-mono text-[9px] text-[var(--primary)] hover:underline">
          Configurar modelos de IA →
        </Link>
      </motion.footer>

      <PlatformConnectorModal
        connector={modal}
        status={modal ? status[modal] : null}
        onClose={closeModal}
        onSave={saveConnector}
      />
    </div>
  );
}