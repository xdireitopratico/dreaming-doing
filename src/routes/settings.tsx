import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  component: () => (
    <DashboardShell requireAuth activeNav="settings">
      <div className="min-h-full overflow-y-auto px-8 py-10">
        <Settings />
      </div>
    </DashboardShell>
  ),
});

function Settings() {
  const { user, signOut } = useAuth();
  return (
    <div className="px-6 py-12 max-w-[720px] mx-auto">
      <h1 className="font-display text-4xl md:text-5xl mb-2">Ajustes</h1>
      <p className="text-sm text-muted-foreground mb-10">Sua conta.</p>
      <Card className="p-6 bg-surface/40">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</div>
        <div className="font-medium mt-1">{user?.email}</div>
      </Card>
      <div className="mt-6">
        <Button variant="outline" onClick={signOut}>
          Sair da conta
        </Button>
      </div>
    </div>
  );
}
