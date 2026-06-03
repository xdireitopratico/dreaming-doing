import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

/**
 * EditorShell — chrome cinemática do editor (Celestial Forge).
 * Topbar com HUD style, grão sutil, glass.
 */
export function EditorShell({
  children,
  projectName,
  right,
}: {
  children: ReactNode;
  projectName?: string;
  right?: ReactNode;
}) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user && typeof window !== "undefined") {
      const next = window.location.pathname;
      window.location.href = `/auth?next=${encodeURIComponent(next)}`;
    }
  }, [loading, user]);

  return (
    <div className="relative h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <div className="grain-overlay pointer-events-none" />
      <header className="relative z-20 h-11 border-b border-[var(--border)] flex items-center px-4 gap-3 shrink-0 bg-background/85 backdrop-blur-xl">
        <Link
          to="/"
          aria-label="Voltar"
          className="text-[var(--text-dim)] hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-[var(--primary)] shadow-[0_0_12px_var(--primary)]"
          />
          <span className="font-display tracking-tight text-sm">FORGE</span>
        </Link>
        {projectName && (
          <>
            <span className="text-[var(--text-ghost)] font-mono text-xs">/</span>
            <span className="text-sm truncate text-[var(--text-dim)]">
              {projectName}
            </span>
          </>
        )}
        <span className="ml-3 hidden md:inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)]">
          <span className="size-1.5 rounded-full bg-[var(--success)] live-dot" />
          LIVE · ORBIT
        </span>
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </header>
      <div className="relative z-10 flex-1 min-h-0">{children}</div>
    </div>
  );
}
