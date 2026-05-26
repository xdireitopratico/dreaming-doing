import { Link, useRouter } from "@tanstack/react-router";
import { Home, FolderGit2, Plug, Settings, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/projects", label: "Projetos", icon: FolderGit2 },
  { to: "/connectors", label: "Conectores", icon: Plug },
  { to: "/settings", label: "Ajustes", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const path = router.state.location.pathname;

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 border-r flex flex-col p-3 gap-1 sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2 px-2 py-3 mb-2">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Sparkles className="size-4" />
          </div>
          <span className="font-semibold">Lovable Clone</span>
        </Link>
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex items-center gap-2 px-2 py-2 rounded-md text-sm transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="size-4" />
              {n.label}
            </Link>
          );
        })}
        <div className="mt-auto pt-3 border-t">
          <div className="px-2 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="size-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/auth";
    return null;
  }
  return <>{children}</>;
}
