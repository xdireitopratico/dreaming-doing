import { Link, Navigate, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  Grid3X3,
  Home,
  Key,
  Library,
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
  | "agents"
  | "connectors"
  | "api-models"
  | "mcp"
  | "skills"
  | "settings"
  | "design-library";

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
        <Link
          to="/agents"
          className="dashboard-nav-item"
          data-active={activeNav === "agents" ? "true" : undefined}
          title="Agentes de IA com fluxos visuais AetherForge"
          onClick={onNavClick}
        >
          <Bot className="size-4 shrink-0" />
          AI Agents
        </Link>
        <button
          type="button"
          className="dashboard-nav-item w-full text-left"
          onClick={handleSearch}
        >
          <Search className="size-4 shrink-0" />
          Buscar
          <span className="dashboard-nav-kbd">Ctrl K</span>
        </button>

        <span className="dashboard-nav-label">Configuração</span>
        <Link
          to="/api-models"
          className="dashboard-nav-item"
          data-active={activeNav === "api-models" ? "true" : undefined}
          onClick={onNavClick}
        >
          <BrainCircuit className="size-4 shrink-0" />
          Api & Models
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
        <Link
          to="/design-library"
          className="dashboard-nav-item"
          data-active={activeNav === "design-library" ? "true" : undefined}
          title="Design Library — extração de DNA visual de sites"
          onClick={onNavClick}
        >
          <Library className="size-4 shrink-0" />
          Design Library
        </Link>

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
            to="/api-models"
            className="dashboard-upgrade flex-1 text-[10px] py-2 justify-center"
            onClick={onNavClick}
          >
            <BrainCircuit className="size-3 text-[var(--forge-primary)]" />
            Api & Models
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
  immersive = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
  activeNav?: NavId;
  /** Sem sidebar nem header mobile — boardroom, Flow React, etc. */
  immersive?: boolean;
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
    return <DashboardShellLoading immersive={immersive} />;
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
    <div className={`dashboard-workspace${immersive ? " dashboard-immersive" : ""}`}>
      {!immersive && (
        <aside className="dashboard-sidebar">
          <DashboardSidebarPanel
            activeNav={activeNav}
            displayName={displayName}
            user={user}
            onSignOut={() => signOut()}
          />
        </aside>
      )}

      <div className="dashboard-main">
        {!immersive && (
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
        )}
        {children}
      </div>

      {!immersive && (
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent
            side="left"
            className="dashboard-mobile-sheet w-[min(280px,88vw)] gap-0 p-0"
          >
            <DashboardSidebarPanel
              activeNav={activeNav}
              displayName={displayName}
              user={user}
              onNavClick={() => setMobileNavOpen(false)}
              onSignOut={() => signOut()}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function DashboardShellLoading({ immersive }: { immersive: boolean }) {
  return (
    <div className={`dashboard-workspace${immersive ? " dashboard-immersive" : ""}`}>
      {!immersive && (
        <aside className="dashboard-sidebar" aria-hidden="true">
          <div className="dashboard-sidebar-brand">
            <div className="h-[18px] w-[18px] rounded-[5px] border border-[var(--forge-border)] bg-[var(--forge-surface-2)]" />
            <div className="h-3.5 w-24 rounded bg-[var(--forge-surface-2)] animate-pulse" />
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-hidden px-1">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`nav-skel-${index}`}
                className="h-8 rounded-md bg-[var(--forge-surface-2)] animate-pulse"
              />
            ))}
          </div>
          <div className="dashboard-sidebar-footer">
            <div className="rounded-xl border border-[var(--forge-border)] bg-[var(--forge-surface-2)] p-3">
              <div className="h-3 w-20 rounded bg-[var(--forge-border-strong)] animate-pulse" />
              <div className="mt-2 h-3 w-full rounded bg-[var(--forge-border-strong)] animate-pulse" />
              <div className="mt-1 h-3 w-4/5 rounded bg-[var(--forge-border-strong)] animate-pulse" />
            </div>
          </div>
        </aside>
      )}

      <div className="dashboard-main">
        {!immersive && (
          <header className="dashboard-mobile-header" aria-hidden="true">
            <div className="h-[18px] w-[86px] rounded bg-[var(--forge-surface-2)] animate-pulse" />
            <div className="size-10 rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface-2)] animate-pulse" />
          </header>
        )}
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="size-6 animate-spin text-[var(--forge-primary)]" />
            <p className="text-xs text-[var(--forge-muted)]">Carregando sessão…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
