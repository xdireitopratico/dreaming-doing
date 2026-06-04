import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderOpen, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PromptEngine } from "@/components/prompt/PromptEngine";
import { CreateProjectDialog } from "@/components/editor/CreateProjectDialog";
import { ImportRepoDialog } from "@/components/ImportRepoDialog";
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

type DockTab = "mine" | "recent" | "starred";

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
  const [dockTab, setDockTab] = useState<DockTab>("mine");
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

  const filtered = useMemo(() => {
    let list = projects ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q),
      );
    }
    if (dockTab === "recent") {
      return [...list].sort((a, b) => {
        const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
        return tb - ta;
      });
    }
    if (dockTab === "starred") {
      return list.filter((p) => Boolean((p.meta as { starred?: boolean })?.starred));
    }
    return list;
  }, [projects, search, dockTab]);

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "builder";

  return (
    <>
      <input
        id="dashboard-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar projetos…"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:z-50 focus:w-64 focus:rounded-lg focus:border focus:border-[var(--forge-border-strong)] focus:bg-[var(--forge-surface-2)] focus:px-3 focus:py-2 focus:text-sm"
        aria-label="Buscar projetos"
      />

      <section className="dashboard-hero">
        <Link
          to="/connectors"
          className="dashboard-hero-badge hover:border-[var(--forge-primary)]/40 transition-colors"
        >
          <Sparkles className="size-3.5 text-[var(--forge-primary)]" />
          Power your app with connectors
          <ArrowRight className="size-3.5 opacity-60" />
        </Link>

        <h1 className="dashboard-hero-title">
          Got an idea, {firstName}?
        </h1>

        <div className="dashboard-prompt-wrap">
          <PromptEngine
            size="hero"
            placeholder="Ask FORGE to create a dashboard to…"
            autoFocus
          />
        </div>
      </section>

      <section className="dashboard-dock" aria-label="Seus projetos">
        <div className="flex items-center gap-2">
          <div className="dashboard-dock-tabs flex-1">
            {(
              [
                ["mine", "My projects"],
                ["recent", "Recently viewed"],
                ["starred", "Starred"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="dashboard-dock-tab"
                data-active={dockTab === id ? "true" : undefined}
                onClick={() => setDockTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <Link to="/projects" className="dashboard-dock-browse">
            Browse all →
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

          {!isLoading && filtered.length === 0 && (
            <p className="self-center px-4 text-sm text-[var(--forge-muted)]">
              {search
                ? "Nenhum projeto encontrado."
                : dockTab === "starred"
                  ? "Nenhum favorito ainda."
                  : "Crie seu primeiro projeto acima."}
            </p>
          )}

          {filtered.map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="dashboard-project-card"
            >
              <div className="dashboard-project-thumb">
                <Sparkles className="size-5 text-[var(--forge-ghost)]" />
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
    </>
  );
}