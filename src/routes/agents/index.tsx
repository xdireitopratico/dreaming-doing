import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AgentsDashboard } from "@/components/dashboard/AgentsDashboard";

export const Route = createFileRoute("/agents/")({
  component: () => (
    <DashboardShell requireAuth activeNav="agents">
      <AgentsDashboard />
    </DashboardShell>
  ),
});