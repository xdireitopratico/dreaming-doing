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

  if (loading) {
    return (
      <DashboardShell requireAuth activeNav="projects">
        <div className="flex items-center justify-center h-full">
          <div className="text-sm text-muted-foreground">Carregando...</div>
        </div>
      </DashboardShell>
    );
  }

  // Admin gate: apenas xdireitopratico@gmail.com
  // (RLS no Supabase reforça no banco; aqui bloqueia UI e flash de conteúdo)
  if (!isForgeAdminEmail(user?.email)) {
    return <Navigate to="/projects" replace />;
  }

  return (
    <DashboardShell requireAuth activeNav="projects">
      <DesignLibraryPage />
    </DashboardShell>
  );
}
