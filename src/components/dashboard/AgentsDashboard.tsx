import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { deleteProject } from "@/lib/projects.functions";
import { supabase } from "@/integrations/supabase/client";
import { PromptEngine } from "@/components/prompt/PromptEngine";
import { CreateAgentDialog } from "@/components/dashboard/CreateAgentDialog";
import { ForgeIcon } from "@/components/icons/ForgeIcon";
import { useAuth } from "@/lib/auth";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase-realtime";
import { isAgentProject, type ProjectListRow } from "@/lib/project-kind";

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

export function AgentsDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, updated_at, created_at, kind, meta")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProjectListRow[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    let channel: ReturnType<typeof subscribePostgresChanges> = null;

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

  const handleDelete = async (e: React.MouseEvent, agentId: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Excluir “${name}”? O fluxo deste agente será removido.`)) return;
    try {
      await deleteProject({ data: { projectId: agentId } });
      void qc.invalidateQueries({ queryKey: ["projects-all"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir");
    }
  };

  const filtered = useMemo(() => {
    const list = (projects ?? []).filter(isAgentProject);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  return (
    <div className="dashboard-stage">
      <input
        id="dashboard-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar agentes…"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:z-50 focus:w-64 focus:rounded-lg focus:border focus:border-[var(--forge-border-strong)] focus:bg-[var(--forge-surface-2)] focus:px-3 focus:py-2 focus:text-sm"
        aria-label="Buscar agentes"
      />

      <section className="dashboard-hero" aria-label="Criar agente com IA">
        <h1 className="dashboard-hero-title">AI Agents</h1>

        <div className="dashboard-prompt-wrap">
          <PromptEngine
            size="hero"
            projectKind="agent"
            placeholder="Descreva o agente de IA que você quer criar…"
            autoFocus
          />
        </div>

        <p className="dashboard-hero-hint">
          <strong>Fluxos visuais</strong> com React Flow e runtime AetherForge. Configure modelos em
          API Keys e Conectores.
        </p>

        <a href="#dashboard-agents" className="dashboard-scroll-cue">
          <span>Seus agentes</span>
          <ChevronDown className="size-4" />
        </a>
      </section>

      <section
        id="dashboard-agents"
        className="dashboard-dock dashboard-dock-secondary"
        aria-label="Meus agentes"
      >
        <div className="dashboard-dock-header">
          <div>
            <p className="dashboard-dock-title">Agentes recentes</p>
            <p className="dashboard-dock-sub">
              {filtered.length === 0 && !isLoading
                ? "Nada aqui ainda — use o prompt acima para começar"
                : `${filtered.length} agente${filtered.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {filtered[0] ? (
            <Link
              to="/agents/$agentId"
              params={{ agentId: filtered[0].id }}
              search={{ open: "flow" }}
              className="dashboard-dock-browse"
            >
              Fluxo Visual
            </Link>
          ) : (
            <a href="#dashboard-hero" className="dashboard-dock-browse">
              Fluxo Visual
            </a>
          )}
        </div>

        <div className="dashboard-projects-row">
          <button type="button" className="dashboard-new-card" onClick={() => setDialogOpen(true)}>
            <Plus className="size-5" />
            Novo agente
          </button>

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
              Agentes aparecem aqui depois que você criar algo no campo acima.
            </p>
          )}

          {!isLoading && filtered.length === 0 && search && (
            <p className="self-center px-4 text-sm text-[var(--forge-muted)]">
              Nenhum agente encontrado para &quot;{search}&quot;.
            </p>
          )}

          {filtered.map((p) => (
            <Link
              key={p.id}
              to="/agents/$agentId"
              params={{ agentId: p.id }}
              className="dashboard-project-card group relative"
            >
              <button
                type="button"
                className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-lg text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                title="Excluir agente"
                aria-label={`Excluir ${p.name}`}
                onClick={(e) => void handleDelete(e, p.id, p.name)}
              >
                <Trash2 className="size-4" />
              </button>
              <div className="dashboard-project-thumb">
                <ForgeIcon variant="agent" size={22} className="text-[var(--forge-ghost)]" />
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

      <CreateAgentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
