import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Github, FolderGit2, LogOut, Settings, User as UserIcon } from "lucide-react";

export function MarketingShell({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const { user, loading, signOut } = useAuth();

  // Soft gate — não bloqueia render, mas redireciona se estiver protegida.
  useEffect(() => {
    if (requireAuth && !loading && !user && typeof window !== "undefined") {
      const next = window.location.pathname;
      window.location.href = `/auth?next=${encodeURIComponent(next)}`;
    }
  }, [requireAuth, loading, user]);

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function TopNav() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-all backdrop-blur-md ${
        scrolled ? "bg-background/70 border-b border-border" : "bg-background/30 border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-[1120px] h-14 px-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <Logo />
          <span className="font-display text-[20px] leading-none">Dream Weaver</span>
          <span className="ml-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
            beta
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          <a href="/#manifesto" className="hover:text-foreground transition-colors">Manifesto</a>
          <a href="/#pilares" className="hover:text-foreground transition-colors">Princípios</a>
          <a href="/#vitrine" className="hover:text-foreground transition-colors">Vitrine</a>
          <a href="/#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-[11px] font-medium">
                    {user.email?.[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="hidden sm:inline text-xs text-muted-foreground max-w-[140px] truncate">
                    {user.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.navigate({ to: "/projects" })}>
                  <FolderGit2 className="size-4 mr-2" /> Meus projetos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.navigate({ to: "/connectors" })}>
                  <UserIcon className="size-4 mr-2" /> Conectores
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.navigate({ to: "/settings" })}>
                  <Settings className="size-4 mr-2" /> Ajustes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    router.navigate({ to: "/" });
                  }}
                >
                  <LogOut className="size-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Entrar</Link>
              </Button>
              <Button asChild size="sm" className="ml-1">
                <Link to="/auth" search={{ mode: "signup" } as any}>
                  Começar
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="mx-auto max-w-[1120px] px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Logo size={14} />
          <span>Dream Weaver — software soberano por IA</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="https://github.com/" className="hover:text-foreground inline-flex items-center gap-1.5">
            <Github className="size-3.5" /> GitHub
          </a>
          <span>Status: operacional</span>
          <a href="mailto:hi@dreamweaver.dev" className="hover:text-foreground">Contato</a>
        </div>
      </div>
    </footer>
  );
}

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-md"
      style={{
        width: size + 8,
        height: size + 8,
        background: "linear-gradient(135deg, var(--primary), var(--accent))",
      }}
    >
      <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="none">
        <path d="M3 19 L9 7 L13 14 L17 9 L21 19 Z" fill="oklch(0.16 0.01 285)" />
      </svg>
    </span>
  );
}
