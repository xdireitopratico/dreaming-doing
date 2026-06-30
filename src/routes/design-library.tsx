import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DesignLibraryPage } from "@/components/design-library";

export const Route = createFileRoute("/design-library")({
  component: DesignLibraryRoute,
});

function DesignLibraryRoute() {
  return (
    <DashboardShell requireAuth activeNav="design-library">
      <DesignLibraryPage />
    </DashboardShell>
  );
}
