import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { Logo } from "@/components/MarketingShell";

/**
 * EditorShell — chrome exclusiva do editor (sem sidebar lateral fixa do marketing).
 * Mantém apenas um topbar denso. A sidebar colapsável real será adicionada
 * no próximo passo dentro de `$projectId.tsx`.
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
    <div className="h-screen flex flex-col bg-background">
      <header className="h-12 border-b border-border flex items-center px-4 gap-3 shrink-0 bg-background/80 backdrop-blur">
        <Link to="/" aria-label="Voltar para home" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <Logo size={14} />
          <span className="font-display text-base hidden sm:inline">Dream Weaver</span>
        </Link>
        {projectName && (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm truncate">{projectName}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">{right}</div>
      </header>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
