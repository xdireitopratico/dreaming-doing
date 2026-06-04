import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export function Logo({ className = "", size = 22 }: { className?: string; size?: number }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 24 24" className="text-[var(--primary)]">
        <polygon
          points="12,1 22,7 22,17 12,23 2,17 2,7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <polygon
          points="12,5 18,8.5 18,15.5 12,19 6,15.5 6,8.5"
          fill="currentColor"
          opacity="0.18"
        />
      </svg>
      <span className="font-display font-bold tracking-[0.18em] text-sm">FORGE</span>
    </Link>
  );
}

/**
 * Lightweight shell used by the authed app pages (projects list, settings,
 * connectors). Renders the same Nav as the landing for visual continuity.
 * Optionally redirects unauthenticated users to /auth.
 */
export function MarketingShell({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (requireAuth && !loading && !user) {
      if (window.location.pathname === "/auth") return;
      const existingNext =
        new URLSearchParams(window.location.search).get("next") ??
        window.location.pathname;
      navigate({
        to: "/auth",
        search: { next: existingNext } as never,
        replace: true,
      });
    }
  }, [requireAuth, loading, user, navigate]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <Nav />
      <main className="relative z-10 pt-16">{children}</main>
    </div>
  );
}
