import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FolderOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProject } from "@/lib/projects.functions";
import { supabase } from "@/integrations/supabase/client";
import { PromptEngine } from "@/components/prompt/PromptEngine";
import { CreateProjectDialog } from "@/components/editor/CreateProjectDialog";
import { ImportRepoDialog } from "@/components/ImportRepoDialog";
import { ForgeIcon } from "@/components/icons/ForgeIcon";
import { useAuth } from "@/lib/auth";
import {
  removeRealtimeChannel,
  subscribePostgresChanges,
} from "@/lib/supabase-realtime";
import type { RealtimeChannel } from "@supabase/supabase-js";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  updated_at: string | null;
  created_at: string | null;
  meta: Record<string, unknown> | null;
};

function formatRelative(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function ProjectsDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, updated_at, created_at, meta")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    let channel: RealtimeChannel | null = null;

    const setup = async () => {
      channel = subscribePostgresChanges({
        channelName: `projects-${user.id}`,
        table: "projects",
        onChange: () => {
          void qc.invalidateQueries({ queryKey: ["projects-all"] });
        },
      });
    };

    void setup();
    return () => removeRealtimeChannel(channel);
  }, [user?.id, qc]);

  const handleDelete = async (e: React.MouseEvent, projectId: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Excluir “${name}”? O ambiente ao vivo deste projeto será encerrado.`)) return;
    try {
      await deleteProject({ data: { projectId } });
      toast.success("Projeto excluído");
      void qc.invalidateQueries({ queryKey: ["projects-all"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir");
    }
  };

  const filtered = useMemo(() => {
    const list = projects ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  return (
    <div className="dashboard-stage">
      <input
        id="dashboard-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar projetos…"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:z-50 focus:w-64 focus:rounded-lg focus:border focus:border-[var(--forge-border-strong)] focus:bg-[var(--forge-surface-2)] focus:px-3 focus:py-2 focus:text-sm"
        aria-label="Buscar projetos"
      />

      {/* Primeira dobra: só o motor de prompt (estilo Grok) */}
      <section className="dashboard-hero" aria-label="Criar com IA">
        <h1 className="dashboard-hero-title">Let&apos;s Build</h1>

        <div className="dashboard-prompt-wrap">
          <PromptEngine
            size="hero"
            placeholder="Descreva o app que você quer criar…"
            autoFocus
          />
        </div>

        <p className="dashboard-hero-hint">
          <strong>Setup obrigatório</strong> em API (modo + modelo). Tira-gosto opcional: ROBIN NVIDIA · Nemotron 550B.
        </p>

        <a href="#dashboard-projects" className="dashboard-scroll-cue">
          <span>Seus projetos</span>
          <ChevronDown className="size-4" />
        </a>
      </section>

      {/* Segunda dobra: projetos (abaixo da primeira tela) */}
      <section
        id="dashboard-projects"
        className="dashboard-dock dashboard-dock-secondary"
        aria-label="Meus projetos"
      >
        <div className="dashboard-dock-header">
          <div>
            <p className="dashboard-dock-title">Projetos recentes</p>
            <p className="dashboard-dock-sub">
              {filtered.length === 0 && !isLoading
                ? "Nada aqui ainda — use o prompt acima para começar"
                : `${filtered.length} projeto${filtered.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Link to="/connectors" className="dashboard-dock-browse">
            Conectores
          </Link>
        </div>

        <div className="dashboard-projects-row">
          <button
            type="button"
            className="dashboard-new-card"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-5" />
            Novo projeto
          </button>

          <ImportRepoDialog
            trigger={
              <button type="button" className="dashboard-new-card">
                <FolderOpen className="size-5" />
                GitHub
              </button>
            }
          />

          {isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="dashboard-project-card animate-pulse opacity-40"
                style={{ minHeight: 140 }}
              />
            ))}

          {!isLoading && filtered.length === 0 && !search && (
            <p className="self-center px-4 text-sm text-[var(--forge-muted)] max-w-md text-center">
              Projetos aparecem aqui depois que você criar algo no campo acima.
            </p>
          )}

          {!isLoading && filtered.length === 0 && search && (
            <p className="self-center px-4 text-sm text-[var(--forge-muted)]">
              Nenhum projeto encontrado para &quot;{search}&quot;.
            </p>
          )}

          {filtered.map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="dashboard-project-card group relative"
            >
              <button
                type="button"
                className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-lg text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                title="Excluir projeto"
                aria-label={`Excluir ${p.name}`}
                onClick={(e) => void handleDelete(e, p.id, p.name)}
              >
                <Trash2 className="size-4" />
              </button>
              <div className="dashboard-project-thumb">
                <ForgeIcon variant="project" size={22} className="text-[var(--forge-ghost)]" />
              </div>
              <div className="dashboard-project-meta">
                <p className="dashboard-project-name">{p.name}</p>
                <p className="dashboard-project-date">
                  Editado {formatRelative(p.updated_at ?? p.created_at)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <CreateProjectDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}