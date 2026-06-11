import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ProjectsDashboard } from "@/components/dashboard/ProjectsDashboard";

export const Route = createFileRoute("/projects/")({
  component: () => (
    <DashboardShell requireAuth activeNav="home">
      <ProjectsDashboard />
    </DashboardShell>
  ),
});
