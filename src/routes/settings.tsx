import { createFileRoute } from "@tanstack/react-router";
import { AppShell, RequireAuth } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/settings")({
  component: () => <RequireAuth><AppShell><Settings /></AppShell></RequireAuth>,
});

function Settings() {
  const { user } = useAuth();
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Ajustes</h1>
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">Email</div>
        <div className="font-medium">{user?.email}</div>
      </Card>
    </div>
  );
}
