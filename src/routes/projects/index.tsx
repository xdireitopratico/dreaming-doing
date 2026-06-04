import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { MarketingShell } from "@/components/MarketingShell";
import { CreateProjectDialog } from "@/components/editor/CreateProjectDialog";
import { Sparkles, Plus, ArrowRight, Clock, FolderOpen } from "lucide-react";

export const Route = createFileRoute("/projects/")({
  component: () => (
    <MarketingShell requireAuth>
      <ProjectsList />
    </MarketingShell>
  ),
});

function ProjectsList() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen px-6 py-16 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-12">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-4xl md:text-5xl text-[var(--foreground)]"
          >
            Seus projetos
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-sm text-[var(--text-dim)] mt-2 font-body"
          >
            Tudo o que você construiu com FORGE.
          </motion.p>
        </div>

        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-display hover:bg-[var(--primary-hot)] transition-colors shadow-lg shadow-[var(--primary)]/20"
        >
          <Plus className="size-4" />
          Novo Projeto
          <ArrowRight className="size-4" />
        </motion.button>
      </div>

      {/* Empty state */}
      {(!projects || projects.length === 0) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 gap-6"
        >
          <div className="size-20 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center">
            <FolderOpen className="size-8 text-[var(--text-ghost)] opacity-50" />
          </div>
          <div className="text-center max-w-sm">
            <h3 className="text-lg font-display text-[var(--foreground)] mb-2">
              Nenhum projeto ainda
            </h3>
            <p className="text-sm text-[var(--text-dim)] mb-6">
              Crie seu primeiro projeto e deixe o agente construir por você.
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-[var(--primary)] text-sm font-mono hover:bg-[var(--primary)]/20 transition-colors"
            >
              <Sparkles className="size-4" />
              Criar Primeiro Projeto
            </button>
          </div>
        </motion.div>
      )}

      {/* Project grid */}
      {projects && projects.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <Link
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="group block rounded-2xl border border-[var(--border)] bg-[var(--surface-1)]/60 hover:border-[var(--primary)]/30 hover:bg-[var(--surface-2)]/30 transition-all duration-200 overflow-hidden"
              >
                {/* Preview thumbnail */}
                <div className="aspect-video bg-[var(--surface-2)] border-b border-[var(--border)] grid place-items-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/5 to-transparent" />
                  <Sparkles className="size-6 text-[var(--text-ghost)] group-hover:text-[var(--primary)]/40 transition-colors" />
                  <div className="absolute bottom-2 right-3">
                    <div className="size-6 rounded-md bg-[var(--surface-1)]/80 border border-[var(--border)] grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="size-3.5 text-[var(--primary)]" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-display text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
                    {p.name}
                  </h3>
                  {p.description ? (
                    <p className="text-[11px] text-[var(--text-dim)] mt-1 truncate">
                      {p.description}
                    </p>
                  ) : (
                    <p className="text-[11px] text-[var(--text-ghost)] mt-1 italic">
                      Sem descrição
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-3 text-[9px] font-mono text-[var(--text-ghost)]">
                    <Clock className="size-2.5" />
                    {p.updated_at
                      ? new Date(p.updated_at).toLocaleDateString("pt-BR")
                      : p.created_at
                        ? new Date(p.created_at).toLocaleDateString("pt-BR")
                        : "—"}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <CreateProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
