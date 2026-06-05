import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Wrench, Check } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SKILLS_CATALOG, loadEnabledSkillIds, toggleSkillId } from "@/lib/skills-catalog";

export const Route = createFileRoute("/skills")({
  component: () => (
    <DashboardShell requireAuth activeNav="skills">
      <SkillsPage />
    </DashboardShell>
  ),
});

function SkillsPage() {
  const [enabled, setEnabled] = useState<string[]>(() => loadEnabledSkillIds());

  useEffect(() => {
    const onUp = () => setEnabled(loadEnabledSkillIds());
    window.addEventListener("forge:skills-updated", onUp);
    return () => window.removeEventListener("forge:skills-updated", onUp);
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof SKILLS_CATALOG>();
    for (const s of SKILLS_CATALOG) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return [...map.entries()];
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
            <Wrench className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Skills</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5 max-w-xl">
              Playbooks de comportamento do LLM ({SKILLS_CATALOG.length} no catálogo). Não é MCP — ferramentas
              externas ficam na aba <Link to="/mcp" className="text-[var(--primary)] hover:underline">MCP</Link>.
            </p>
          </div>
        </div>
      </motion.div>

      <p className="mb-6 font-mono text-[10px] text-emerald-400/90">
        {enabled.length} skill(s) ativa(s) — enviadas automaticamente no próximo{" "}
        <strong className="text-[var(--foreground)]">agent-run</strong>
      </p>

      {byCategory.map(([cat, items]) => (
        <section key={cat} className="mb-8">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-3">
            {cat}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((s) => {
              const on = enabled.includes(s.id);
              return (
                <div
                  key={s.id}
                  className="p-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 flex gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[11px]">{s.name}</p>
                    <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">{s.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = toggleSkillId(s.id);
                      setEnabled(next);
                      toast.success(on ? `${s.name} removida` : `${s.name} disponível para o agente`);
                    }}
                    className={`shrink-0 grid size-8 place-items-center rounded-lg border ${
                      on
                        ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-400"
                        : "border-[var(--border)]"
                    }`}
                  >
                    {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}