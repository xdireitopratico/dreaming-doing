import { Link, Navigate, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronDown,
  Grid3X3,
  Home,
  Loader2,
  Plug,
  Search,
  Settings,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { useAuth } from "@/lib/auth";
import { sanitizeNext } from "@/lib/sanitize-next";

type NavId = "home" | "projects" | "connectors" | "settings";

export function DashboardShell({
  children,
  requireAuth = true,
  activeNav = "home",
}: {
  children: ReactNode;
  requireAuth?: boolean;
  activeNav?: NavId;
}) {
  const { user, loading, signOut } = useAuth();
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById("dashboard-search");
        el?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) {
    return (
      <div className="dashboard-workspace grid place-items-center">
        <Loader2 className="size-6 animate-spin text-[var(--forge-primary)]" />
      </div>
    );
  }

  if (requireAuth && !user) {
    return <Navigate to="/auth" search={{ next: sanitizeNext(loc.pathname) }} replace />;
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "builder";

  return (
    <div className="dashboard-workspace">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-brand">
          <ForgeLogoMark linkTo="/projects" size={18} />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm text-[var(--forge-text)]"
            onClick={() => navigate({ to: "/settings" })}
          >
            <span className="truncate font-medium">{displayName}&apos;s FORGE</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </button>
        </div>

        <nav className="dashboard-nav">
          <Link
            to="/projects"
            className="dashboard-nav-item"
            data-active={activeNav === "home" ? "true" : undefined}
          >
            <Home className="size-4 shrink-0" />
            Home
          </Link>
          <button
            type="button"
            className="dashboard-nav-item w-full text-left"
            onClick={() => document.getElementById("dashboard-search")?.focus()}
          >
            <Search className="size-4 shrink-0" />
            Buscar
            <span className="dashboard-nav-kbd">Ctrl K</span>
          </button>
          <a href="/#how-it-works" className="dashboard-nav-item">
            <BookOpen className="size-4 shrink-0" />
            Recursos
          </a>
          <Link
            to="/connectors"
            className="dashboard-nav-item"
            data-active={activeNav === "connectors" ? "true" : undefined}
          >
            <Plug className="size-4 shrink-0" />
            Conectores
          </Link>

          <span className="dashboard-nav-label">Projetos</span>
          <Link
            to="/projects"
            className="dashboard-nav-item"
            data-active={activeNav === "projects" ? "true" : undefined}
          >
            <Grid3X3 className="size-4 shrink-0" />
            Todos os projetos
          </Link>
          <span className="dashboard-nav-item opacity-60 cursor-default">
            <Star className="size-4 shrink-0" />
            Favoritos
            <span className="dashboard-nav-kbd">em breve</span>
          </span>
        </nav>

        <div className="dashboard-sidebar-footer">
          <div className="rounded-xl border border-[var(--forge-border)] p-3 text-[11px] text-[var(--forge-muted)]">
            <Sparkles className="size-3.5 text-[var(--forge-primary)] mb-1.5" />
            Convide amigos e ganhe créditos na beta.
          </div>
          <Link to="/connectors" className="dashboard-upgrade">
            <Zap className="size-4 text-[var(--forge-primary)]" />
            Conectores &amp; API keys
          </Link>
          <Link
            to="/settings"
            className="dashboard-nav-item"
            data-active={activeNav === "settings" ? "true" : undefined}
          >
            <Settings className="size-4 shrink-0" />
            Ajustes
          </Link>
          {user && (
            <button
              type="button"
              className="dashboard-nav-item w-full text-left text-[var(--forge-ghost)]"
              onClick={() => signOut()}
            >
              Sair
            </button>
          )}
        </div>
      </aside>

      <div className="dashboard-main">{children}</div>
    </div>
  );
}