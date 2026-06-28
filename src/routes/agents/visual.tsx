/**
 * /agents/visual — Editor React Flow aberto com ID real.
 *
 * Quando o user clica em "Fluxo Visual" no /agents, cai aqui sem params.
 * Esta rota cria 1 flow vazio no banco (INSERT direto) e atualiza a URL
 * com o id novo. Em refresh, o flowId vem no search param e a rota
 * so renderiza o editor — sem criar outro flow.
 *
 * O card "Novo Agente" aparece na dashboard apos o clique. User deleta
 * manualmente se nao quiser. Sem cleanup automatico, sem projeto "scratch".
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
      const { data, error } = await supabase
        .from("agent_flows")
        .insert({
          name: "Novo Agente",
          description: "",
          flow_definition: { nodes: [], edges: [] },
          status: "draft",
          channels: [],
          user_id: user.id,
        })
        .select("id")
        .single();
      if (error || !data) {
        console.error("[visual] Failed to create flow:", error);
        void navigate({ to: "/agents" });
        return;
      }
      setFlowId(data.id);
      setCreating(false);
      void navigate({ to: "/agents/visual", search: { flowId: data.id }, replace: true });
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
