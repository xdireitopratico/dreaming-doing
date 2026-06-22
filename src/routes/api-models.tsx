import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ApiModelsPage } from "@/components/connectors/api-models/ApiModelsPage";

export const Route = createFileRoute("/api-models")({
  component: () => (
    <DashboardShell requireAuth activeNav="api-models">
      <ApiModelsPage />
    </DashboardShell>
  ),
});
