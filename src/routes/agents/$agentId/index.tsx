import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ForgeIcon } from "@/components/icons/ForgeIcon";
import { supabase } from "@/integrations/supabase/client";
import { isAgentProject, type ProjectKind } from "@/lib/project-kind";

export const Route = createFileRoute("/agents/$agentId/")({
  component: AgentEditorPlaceholder,
});

function AgentEditorPlaceholder() {
  const { agentId } = Route.useParams();

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
    <DashboardShell requireAuth activeNav="agents">
      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--forge-border)] px-4 py-3 md:px-6">
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

        <main className="grid flex-1 place-items-center p-6">
          {isLoading && <Loader2 className="size-6 animate-spin text-[var(--forge-primary)]" />}
          {!isLoading && (error || !agent) && (
            <div className="max-w-md text-center">
              <p className="text-sm text-[var(--forge-muted)]">
                {error instanceof Error ? error.message : "Agente não encontrado."}
              </p>
              <Link to="/agents" className="mt-4 inline-block text-sm text-[var(--forge-primary)]">
                Voltar para AI Agents
              </Link>
            </div>
          )}
          {!isLoading && agent && (
            <div className="max-w-lg rounded-2xl border border-dashed border-[var(--forge-border-strong)] bg-[var(--forge-surface)] p-8 text-center">
              <ForgeIcon
                variant="agent"
                size={32}
                className="mx-auto text-[var(--forge-primary)]"
              />
              <h1 className="mt-4 text-lg font-medium text-[var(--forge-text)]">
                Flow builder em breve
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--forge-muted)]">
                O editor React Flow (AetherForge) será montado aqui. O runtime usa{" "}
                <code className="text-xs">agent_flows</code> e{" "}
                <code className="text-xs">aetherforge-gateway</code> — separado do app builder de
                sites.
              </p>
            </div>
          )}
        </main>
      </div>
    </DashboardShell>
  );
}