import { lazy, Suspense, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ForgeIcon } from "@/components/icons/ForgeIcon";
import { supabase } from "@/integrations/supabase/client";
import { isAgentProject, type ProjectKind } from "@/lib/project-kind";

const AdminAgentBuilderView = lazy(
  () => import("@/components/forge-agents/AdminAgentBuilderView")
);

type AgentEditorSearch = {
  open?: "flow";
};

export const Route = createFileRoute("/agents/$agentId/")({
  component: AgentEditorPage,
  validateSearch: (search: Record<string, unknown>): AgentEditorSearch => {
    const open = search.open === "flow" ? "flow" : undefined;
    return open ? { open } : {};
  },
  ssr: false,
});

function AgentEditorPage() {
  const { agentId } = Route.useParams();
  const { open } = Route.useSearch();
  const [immersiveActive, setImmersiveActive] = useState(false);

  const { data: agent, isLoading, error } = useQuery({
    queryKey: ["agent-project", agentId],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from("projects")
        .select("id, name, description, kind, meta")
        .eq("id", agentId)
        .maybeSingle();
      if (qErr) throw qErr;
      if (
        !data ||
        !isAgentProject({
          kind: data.kind as ProjectKind,
          meta: data.meta as Record<string, unknown> | null,
        })
      ) {
        return null;
      }
      return data;
    },
  });

  return (
    <DashboardShell requireAuth activeNav="agents" immersive={immersiveActive}>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {!immersiveActive && (
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--forge-border)] px-4 py-3 md:px-6">
            <Link
              to="/agents"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--forge-muted)] hover:bg-[var(--forge-surface-2)] hover:text-[var(--forge-text)]"
            >
              <ArrowLeft className="size-4" />
              Agentes
            </Link>
            <ForgeIcon variant="agent" size={18} className="text-[var(--forge-primary)]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--forge-text)]">
                {agent?.name ?? "Agente"}
              </p>
              {agent?.description && (
                <p className="truncate text-xs text-[var(--forge-muted)]">{agent.description}</p>
              )}
            </div>
          </header>
        )}

        <main
          className={
            immersiveActive
              ? "h-full min-h-0 flex-1 overflow-hidden"
              : "min-h-0 flex-1 overflow-hidden px-3 pb-3 pt-3 lg:px-6 lg:pb-6 lg:pt-3"
          }
        >
          {isLoading && (
            <div className="grid h-full place-items-center">
              <Loader2 className="size-6 animate-spin text-[var(--forge-primary)]" />
            </div>
          )}
          {!isLoading && (error || !agent) && (
            <div className="grid h-full place-items-center p-6">
              <div className="max-w-md text-center">
                <p className="text-sm text-[var(--forge-muted)]">
                  {error instanceof Error ? error.message : "Agente não encontrado."}
                </p>
                <Link to="/agents" className="mt-4 inline-block text-sm text-[var(--forge-primary)]">
                  Voltar para AI Agents
                </Link>
              </div>
            </div>
          )}
          {!isLoading && agent && (
            <Suspense
              fallback={
                <div className="grid h-full place-items-center">
                  <Loader2 className="size-6 animate-spin text-[var(--forge-primary)]" />
                </div>
              }
            >
              <AdminAgentBuilderView
                projectId={agentId}
                projectName={agent.name}
                initialOpenFlow={open === "flow"}
                onImmersiveChange={setImmersiveActive}
                initialPrompt={
                  typeof (agent.meta as Record<string, unknown> | null)?.initialPrompt === "string"
                    ? ((agent.meta as Record<string, unknown>).initialPrompt as string)
                    : null
                }
              />
            </Suspense>
          )}
        </main>
      </div>
    </DashboardShell>
  );
}