import { createFileRoute, Navigate } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DesignLibraryPage } from "@/components/design-library";
import { isForgeAdminEmail } from "@/lib/forge-admin";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/design-library")({
  component: DesignLibraryRoute,
});

function DesignLibraryRoute() {
  const { user, loading } = useAuth();

  // Admin gate: apenas xdireitopratico@gmail.com
  // (RLS no Supabase reforça no banco; aqui bloqueia UI e flash de conteúdo)
  if (!loading && !isForgeAdminEmail(user?.email)) {
    return <Navigate to="/projects" replace />;
  }

  return (
    <DashboardShell requireAuth activeNav="design-library">
      <DesignLibraryPage />
    </DashboardShell>
  );
}
