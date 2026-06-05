import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Puzzle, Check } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MCP_CATALOG, loadEnabledMcpIds, toggleMcpId } from "@/lib/mcp-catalog";

export const Route = createFileRoute("/mcp")({
  component: () => (
    <DashboardShell requireAuth activeNav="mcp">
      <McpPage />
    </DashboardShell>
  ),
});

function McpPage() {
  const [enabled, setEnabled] = useState<string[]>(() => loadEnabledMcpIds());

  useEffect(() => {
    const onUp = () => setEnabled(loadEnabledMcpIds());
    window.addEventListener("forge:mcp-updated", onUp);
    return () => window.removeEventListener("forge:mcp-updated", onUp);
  }, []);

  return (
    <div className="px-6 py-8 max-w-[960px] mx-auto">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] mb-6"
      >
        <ArrowLeft className="size-3" />
        PROJETOS
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <Puzzle className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">MCP</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5 max-w-xl">
              Servidores Model Context Protocol (ferramentas: GitHub, Supabase, browser…). Não é Skill — instruções
              do agente ficam em <Link to="/skills" className="text-[var(--primary)] hover:underline">Skills</Link>.
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MCP_CATALOG.map((m) => {
          const on = enabled.includes(m.id);
          return (
            <div
              key={m.id}
              className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/40 flex gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[12px]">{m.name}</p>
                <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 leading-relaxed">
                  {m.description}
                </p>
                <p className="font-mono text-[8px] text-[var(--text-dim)] mt-2 uppercase">
                  {m.transport}
                  {m.envKeys?.length ? ` · ${m.envKeys.join(", ")}` : ""}
                </p>
              </div>
              <button
                type="button"
                title={on ? "Desativar" : "Ativar"}
                onClick={() => {
                  const next = toggleMcpId(m.id);
                  setEnabled(next);
                  toast.success(on ? `${m.name} desativado` : `${m.name} ativo no agente`);
                }}
                className={`shrink-0 grid size-9 place-items-center rounded-lg border transition-colors ${
                  on
                    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-400"
                    : "border-[var(--border)] hover:border-[var(--primary)]/40"
                }`}
              >
                {on ? <Check className="size-4" /> : <Plus className="size-4" />}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 font-mono text-[9px] text-[var(--text-ghost)] leading-relaxed max-w-lg">
        Tokens sensíveis continuam em API / Conectores. MCPs ativos entram no system prompt do próximo agent-run
        (evento SSE <code className="text-[var(--text-dim)]">start</code> lista{" "}
        <code className="text-[var(--text-dim)]">activeMcps</code>).
      </p>
    </div>
  );
}