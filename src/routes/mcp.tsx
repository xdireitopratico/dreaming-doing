import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Puzzle, Check, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MCP_CATALOG } from "@/lib/mcp-catalog";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  mergeExtensionsFromProfile,
  toggleMcpIdPersisted,
} from "@/lib/agent-extensions-prefs";

export const Route = createFileRoute("/mcp")({
  component: () => (
    <DashboardShell requireAuth activeNav="mcp">
      <McpPage />
    </DashboardShell>
  ),
});

function McpPage() {
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

  useEffect(() => {
    if (!profile) return;
    setEnabled(mergeExtensionsFromProfile(profile.integration_prefs).mcpIds);
  }, [profile]);

  useEffect(() => {
    const onUp = () => {
      if (!profile) return;
      setEnabled(mergeExtensionsFromProfile(profile.integration_prefs).mcpIds);
    };
    window.addEventListener("forge:mcp-updated", onUp);
    return () => window.removeEventListener("forge:mcp-updated", onUp);
  }, [profile]);

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
              Integrações com <strong className="text-[var(--foreground)]">tools executáveis</strong> no
              agent-run (não só texto no prompt). Tokens em Conectores / API Keys.
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
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-mono text-[12px]">{m.name}</p>
                  {m.executable && m.toolCount > 0 ? (
                    <span className="inline-flex items-center gap-0.5 font-mono text-[7px] px-1 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/25">
                      <Zap className="size-2.5" />
                      {m.toolCount} tools
                    </span>
                  ) : (
                    <span className="font-mono text-[7px] px-1 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-ghost)]">
                      guia
                    </span>
                  )}
                </div>
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
                  if (!user?.id) return;
                  void toggleMcpIdPersisted(user.id, m.id, profile?.integration_prefs)
                    .then((next) => {
                      setEnabled(next);
                    })
                    .catch((e: unknown) => {
                      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
                    });
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
        Context7 aceita <code className="text-[var(--text-dim)]">CONTEXT7_API_KEY</code> opcional em
        secrets do Supabase para limites maiores. GitHub e Vercel exigem Conectores. Supabase MCP usa o
        banco FORGE (SELECT only).
      </p>
    </div>
  );
}