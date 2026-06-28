/**
 * /agents/visual — Editor React Flow aberto com ID real.
 *
 * Quando o user clica em "Fluxo Visual" no /agents, cai aqui sem params.
 * Esta rota cria 1 projects(kind="agent") + 1 agent_flows(project_id) linkado
 * (mesmo padrao de createProjectFromPrompt) e atualiza a URL com o id do flow.
 * Em refresh, o flowId vem no search param e a rota so renderiza o editor
 * — sem criar outro flow.
 *
 * O card aparece na dashboard (AgentsDashboard le projects.kind="agent")
 * e o cascade delete ja esta completo (projects → agent_flows → filhas).
 *
 * O flowId e real desde o inicio, entao o chat do Vibe Coding funciona
 * sem nenhuma refatoracao (FlowCanvas:190 so checa flowId truthy).
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PrometheusLoadingSkeleton } from "@/components/forge-prometheus/PrometheusLoadingSkeleton";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

const FlowBuilderDialog = lazy(
  () => import("@/components/forge-agents/flow-builder/FlowBuilderDialog").then(m => ({ default: m.FlowBuilderDialog }))
);

type Search = { flowId?: string };

export const Route = createFileRoute("/agents/visual")({
  component: VisualEditorPage,
  validateSearch: (s: Record<string, unknown>): Search => ({
    flowId: typeof s.flowId === "string" ? s.flowId : undefined,
  }),
  ssr: false,
});

function makeSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `agent-${ts}-${rand}`;
}

function VisualEditorPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = useSearch({ from: "/agents/visual" });
  const [flowId, setFlowId] = useState<string | null>(search.flowId ?? null);
  const [open, setOpen] = useState(true);
  const [creating, setCreating] = useState(!search.flowId);

  useEffect(() => {
    if (flowId || !user) return;
    void (async () => {
      const projectName = "Novo Agente";

      const { data: project, error: pErr } = await supabase
        .from("projects")
        .insert({
          owner_id: user.id,
          name: projectName,
          slug: makeSlug(),
          description: null,
          template: "aetherforge-agent",
          kind: "agent",
          meta: { createdFrom: "visual-button" },
        })
        .select("id")
        .single();
      if (pErr || !project) {
        console.error("[visual] Failed to create project:", pErr);
        void navigate({ to: "/agents" });
        return;
      }

      const { data: flow, error: fErr } = await supabase
        .from("agent_flows")
        .insert({
          name: projectName,
          description: null,
          flow_definition: { nodes: [], edges: [] },
          status: "draft",
          channels: [],
          user_id: user.id,
          project_id: project.id,
        })
        .select("id")
        .single();
      if (fErr || !flow) {
        console.error("[visual] Failed to create flow:", fErr);
        void navigate({ to: "/agents" });
        return;
      }

      setFlowId(flow.id);
      setCreating(false);
      void navigate({ to: "/agents/visual", search: { flowId: flow.id }, replace: true });
    })();
  }, [user, flowId, navigate]);

  const handleClose = useCallback(() => {
    setOpen(false);
    void navigate({ to: "/agents" });
  }, [navigate]);

  return (
    <DashboardShell requireAuth activeNav="agents" immersive>
      <Suspense fallback={<PrometheusLoadingSkeleton />}>
        {creating || !flowId ? (
          <PrometheusLoadingSkeleton />
        ) : (
          <FlowBuilderDialog
            flowId={flowId}
            projectId=""
            open={open}
            onClose={handleClose}
          />
        )}
      </Suspense>
    </DashboardShell>
  );
}
