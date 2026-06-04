import { createFileRoute, Link } from "@tanstack/react-router";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Key, Plug } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: () => (
    <DashboardShell requireAuth activeNav="settings">
      <Settings />
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
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          to="/connectors"
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-4 hover:bg-[var(--surface-1)] transition-colors"
        >
          <Plug className="size-5 text-[var(--primary)]" />
          <div>
            <div className="text-sm font-medium">Conectores</div>
            <div className="text-xs text-muted-foreground">GitHub, Supabase, Vercel, Cloudflare</div>
          </div>
        </Link>
        <Link
          to="/api-keys"
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-4 hover:bg-[var(--surface-1)] transition-colors"
        >
          <Key className="size-5 text-[var(--primary)]" />
          <div>
            <div className="text-sm font-medium">API Keys</div>
            <div className="text-xs text-muted-foreground">IA, pool Rob, potência do modelo</div>
          </div>
        </Link>
      </div>
      <div className="mt-6">
        <Button variant="outline" onClick={signOut}>
          Sair da conta
        </Button>
      </div>
    </div>
  );
}
