/**
 * /agents/visual — Editor React Flow vazio, sem projeto, sem boardroom.
 *
 * Quando o user clica em "Fluxo Visual" no /agents, cai aqui direto.
 * Renderiza <FlowBuilderDialog flowId={null}> que abre o editor virgem.
 * Para usar: o user arrasta nodes/edges e clica "Salvar" — isso cria
 * um agent_flow novo no banco (INSERT) e atualiza o id interno.
 */
import { lazy, Suspense, useCallback, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PrometheusLoadingSkeleton } from "@/components/forge-prometheus/PrometheusLoadingSkeleton";

const FlowBuilderDialog = lazy(
  () => import("@/components/forge-agents/flow-builder/FlowBuilderDialog").then(m => ({ default: m.FlowBuilderDialog }))
);

export const Route = createFileRoute("/agents/visual")({
  component: VisualEditorPage,
  ssr: false,
});

function VisualEditorPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [flowId, setFlowId] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    void navigate({ to: "/agents" });
  }, [navigate]);

  const handleFlowIdChange = useCallback((newId: string) => {
    setFlowId(newId);
  }, []);

  return (
    <DashboardShell requireAuth activeNav="agents" immersive>
      <Suspense fallback={<PrometheusLoadingSkeleton />}>
        {open && (
          <FlowBuilderDialog
            flowId={flowId}
            projectId=""
            open={open}
            onClose={handleClose}
            onFlowIdChange={handleFlowIdChange}
          />
        )}
      </Suspense>
    </DashboardShell>
  );
}
