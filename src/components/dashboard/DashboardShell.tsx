import { Link, Navigate, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  Brain,
  ChevronDown,
  Grid3X3,
  Home,
  Key,
  Loader2,
  LogOut,
  Menu,
  Plug,
  Puzzle,
  Search,
  Settings,
  Star,
  Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ForgeLogoMark } from "@/components/editor/ForgeLogoMark";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { sanitizeNext } from "@/lib/sanitize-next";

type NavId =
  | "home"
  | "projects"
  | "connectors"
  | "api"
  | "models"
  | "mcp"
  | "skills"
  | "settings";

type DashboardSidebarPanelProps = {
  activeNav: NavId;
  displayName: string;
  user: ReturnType<typeof useAuth>["user"];
  onNavClick?: () => void;
  onSignOut: () => void;
};

function DashboardSidebarPanel({
  activeNav,
  displayName,
  user,
  onNavClick,
  onSignOut,
}: DashboardSidebarPanelProps) {
  const navigate = useNavigate();

  const handleSearch = () => {
    document.getElementById("dashboard-search")?.focus();
    onNavClick?.();
  };

  return (
    <>
      <div className="dashboard-sidebar-brand">
        <ForgeLogoMark linkTo="/projects" size={18} onClick={onNavClick} />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm text-[var(--forge-text)]"
          onClick={() => {
            void navigate({ to: "/settings" });
            onNavClick?.();
          }}
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
          onClick={onNavClick}
        >
          <Home className="size-4 shrink-0" />
          Home
        </Link>
        <button type="button" className="dashboard-nav-item w-full text-left" onClick={handleSearch}>
          <Search className="size-4 shrink-0" />
          Buscar
          <span className="dashboard-nav-kbd">Ctrl K</span>
        </button>

        <span className="dashboard-nav-label">Configuração</span>
        <Link
          to="/api"
          className="dashboard-nav-item"
          data-active={activeNav === "api" ? "true" : undefined}
          onClick={onNavClick}
        >
          <Key className="size-4 shrink-0" />
          API Keys
        </Link>
        <Link
          to="/models"
          className="dashboard-nav-item"
          data-active={activeNav === "models" ? "true" : undefined}
          onClick={onNavClick}
        >
          <Brain className="size-4 shrink-0" />
          Modelos
        </Link>
        <Link
          to="/connectors"
          className="dashboard-nav-item"
          data-active={activeNav === "connectors" ? "true" : undefined}
          onClick={onNavClick}
        >
          <Plug className="size-4 shrink-0" />
          Conectores
        </Link>

        <span className="dashboard-nav-label">Agente</span>
        <Link
          to="/skills"
          className="dashboard-nav-item"
          data-active={activeNav === "skills" ? "true" : undefined}
          title="Playbooks e instruções para o LLM"
          onClick={onNavClick}
        >
          <Wrench className="size-4 shrink-0" />
          Skills
        </Link>
        <Link
          to="/mcp"
          className="dashboard-nav-item"
          data-active={activeNav === "mcp" ? "true" : undefined}
          title="Servidores Model Context Protocol (ferramentas externas)"
          onClick={onNavClick}
        >
          <Puzzle className="size-4 shrink-0" />
          MCP
        </Link>

        <a href="/#how-it-works" className="dashboard-nav-item" onClick={onNavClick}>
          <BookOpen className="size-4 shrink-0" />
          Recursos
        </a>

        <span className="dashboard-nav-label">Projetos</span>
        <Link
          to="/projects"
          className="dashboard-nav-item"
          data-active={activeNav === "projects" ? "true" : undefined}
          onClick={onNavClick}
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
        <div className="rounded-xl border border-[var(--forge-border)] p-3 text-[11px] leading-relaxed text-[var(--forge-muted)]">
          <strong className="text-[var(--forge-text)] font-medium">Taste + BYOK</strong>
          <p className="mt-1">
            50 mensagens e 1 Start Project. Depois: API Keys, Modelos e Skills/MCP no painel.
          </p>
        </div>
        <div className="flex gap-1">
          <Link
            to="/api"
            className="dashboard-upgrade flex-1 text-[10px] py-2 justify-center"
            onClick={onNavClick}
          >
            <Key className="size-3 text-[var(--forge-primary)]" />
            API Keys
          </Link>
          <Link
            to="/models"
            className="dashboard-upgrade flex-1 text-[10px] py-2 justify-center"
            onClick={onNavClick}
          >
            <Brain className="size-3 text-[var(--forge-primary)]" />
            Modelos
          </Link>
        </div>
        <div className="dashboard-footer-row">
          <Link
            to="/settings"
            className="dashboard-nav-item dashboard-nav-item-compact"
            data-active={activeNav === "settings" ? "true" : undefined}
            onClick={onNavClick}
          >
            <Settings className="size-3.5 shrink-0" />
            Ajustes
          </Link>
          {user && (
            <button
              type="button"
              className="dashboard-nav-item dashboard-nav-item-compact text-left text-[var(--forge-ghost)]"
              onClick={() => {
                onSignOut();
                onNavClick?.();
              }}
            >
              <LogOut className="size-3.5 shrink-0" />
              Sair
            </button>
          )}
        </div>
      </div>
    </>
  );
}

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("dashboard-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [loc.pathname]);

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
        <DashboardSidebarPanel
          activeNav={activeNav}
          displayName={displayName}
          user={user}
          onSignOut={() => signOut()}
        />
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-mobile-header">
          <ForgeLogoMark linkTo="/projects" size={18} />
          <button
            type="button"
            className="dashboard-mobile-menu-btn"
            aria-label="Abrir menu de navegação"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-5" />
          </button>
        </header>
        {children}
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="dashboard-mobile-sheet w-[min(280px,88vw)] gap-0 p-0">
          <DashboardSidebarPanel
            activeNav={activeNav}
            displayName={displayName}
            user={user}
            onNavClick={() => setMobileNavOpen(false)}
            onSignOut={() => signOut()}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}