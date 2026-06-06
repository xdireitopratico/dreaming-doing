import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Wrench, Check, BookOpen, Search, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SKILLS_CATALOG } from "@/lib/skills-catalog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  mergeExtensionsFromProfile,
  toggleSkillIdPersisted,
  setSkillIdsPersisted,
} from "@/lib/agent-extensions-prefs";

export const Route = createFileRoute("/skills")({
  component: () => (
    <DashboardShell requireAuth activeNav="skills">
      <SkillsPage />
    </DashboardShell>
  ),
});

function SkillsPage() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("integration_prefs")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [enabled, setEnabled] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [onlyBundled, setOnlyBundled] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const { skillIds } = mergeExtensionsFromProfile(profile.integration_prefs);
    setEnabled(skillIds);
  }, [profile]);

  useEffect(() => {
    const onUp = () => {
      if (!profile) return;
      setEnabled(mergeExtensionsFromProfile(profile.integration_prefs).skillIds);
    };
    window.addEventListener("forge:skills-updated", onUp);
    return () => window.removeEventListener("forge:skills-updated", onUp);
  }, [profile]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SKILLS_CATALOG.filter((s) => {
      if (onlyBundled && !s.bundled) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });
  }, [query, onlyBundled]);

  const byCategory = useMemo(() => {
    const map = new Map<string, typeof SKILLS_CATALOG>();
    for (const s of filtered) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const bundledCount = SKILLS_CATALOG.filter((s) => s.bundled).length;
  const filteredCount = filtered.length;
  const hasFilter = query.trim() !== "" || onlyBundled;

  const persist = useCallback(
    async (nextIds: string[], successMessage: string) => {
      if (!user?.id) return;
      try {
        const next = await setSkillIdsPersisted(user.id, nextIds, profile?.integration_prefs);
        setEnabled(next);
        toast.success(successMessage);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      }
    },
    [user?.id, profile?.integration_prefs],
  );

  const toggle = useCallback(
    (id: string, name: string, wasOn: boolean) => {
      const next = wasOn ? enabled.filter((x) => x !== id) : [...enabled, id];
      void persist(next, wasOn ? `${name} desativada` : `${name} ativa no agente`);
    },
    [enabled, persist],
  );

  const activateAllVisible = useCallback(() => {
    const ids = filtered.map((s) => s.id);
    const next = Array.from(new Set([...enabled, ...ids]));
    void persist(next, `${ids.length} skill(s) ativadas no agente`);
  }, [filtered, enabled, persist]);

  const deactivateAllVisible = useCallback(() => {
    const ids = new Set(filtered.map((s) => s.id));
    const next = enabled.filter((id) => !ids.has(id));
    void persist(next, "Skills visíveis desativadas");
  }, [filtered, enabled, persist]);

  const hasVisibleOn = filtered.some((s) => enabled.includes(s.id));
  const hasVisibleOff = filtered.some((s) => !enabled.includes(s.id));

  return (
    <div className="px-6 py-8 max-w-[960px] mx-auto">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] mb-6"
      >
        <ArrowLeft className="size-3" />
        PROJETOS
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <Wrench className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Skills</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5 max-w-xl">
              {bundledCount} skills com SKILL.md no servidor — o agente recebe o playbook completo
              (comprimido com orçamento inteligente). Não é MCP — ferramentas externas em{" "}
              <Link to="/mcp" className="text-[var(--primary)] hover:underline">
                MCP
              </Link>
              .
            </p>
          </div>
        </div>
      </motion.div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-ghost)] pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar skill (ex: Vercel, TDD, debug…)"
            className="w-full pl-8 pr-8 py-1.5 bg-[var(--surface-1)]/50 border border-[var(--border)] rounded-lg font-mono text-[11px] placeholder:text-[var(--text-ghost)] focus:outline-none focus:border-[var(--primary)]/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-ghost)] hover:text-[var(--foreground)]"
              aria-label="Limpar busca"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOnlyBundled((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[10px] transition-colors ${
            onlyBundled
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
              : "border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text-dim)]/40"
          }`}
        >
          <Sparkles className="size-3" />
          só SKILL.md
        </button>
        {hasFilter && hasVisibleOn && (
          <button
            type="button"
            onClick={deactivateAllVisible}
            className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] font-mono text-[10px] text-[var(--text-dim)] hover:border-[var(--destructive)]/40 hover:text-[var(--destructive)]"
          >
            desativar visíveis
          </button>
        )}
        {hasFilter && hasVisibleOff && (
          <button
            type="button"
            onClick={activateAllVisible}
            className="px-2.5 py-1.5 rounded-lg border border-emerald-400/30 font-mono text-[10px] text-emerald-400 hover:bg-emerald-400/10"
          >
            ativar visíveis
          </button>
        )}
      </div>

      <p className="mb-6 font-mono text-[10px] text-emerald-400/90">
        {enabled.length} ativa(s){hasFilter ? ` · ${filteredCount} visível(is)` : ""} — sincronizado no perfil · próximo agent-run injeta conteúdo real
      </p>

      {byCategory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
          <Search className="size-5 text-[var(--text-ghost)] mx-auto mb-2" />
          <p className="font-mono text-[11px] text-[var(--text-dim)]">
            Nenhuma skill encontrada para &ldquo;{query}&rdquo;
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOnlyBundled(false);
            }}
            className="mt-2 font-mono text-[10px] text-[var(--primary)] hover:underline"
          >
            limpar filtros
          </button>
        </div>
      ) : (
        byCategory.map(([cat, items]) => (
          <section key={cat} className="mb-8">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-3">
              {cat} · {items.length}
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono text-[11px]">{s.name}</p>
                        {s.bundled ? (
                          <span className="font-mono text-[7px] px-1 py-0.5 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/25">
                            SKILL.md
                          </span>
                        ) : (
                          <span className="font-mono text-[7px] px-1 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-ghost)]">
                            resumo
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[9px] text-[var(--text-ghost)] mt-0.5">{s.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(s.id, s.name, on)}
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
        ))
      )}

      <p className="font-mono text-[9px] text-[var(--text-ghost)] flex items-center gap-1.5">
        <BookOpen className="size-3" />
        Atualizar bundle após novas skills:{" "}
        <code className="text-[var(--text-dim)]">node scripts/bundle-forge-skills.mjs</code>
      </p>
    </div>
  );
}