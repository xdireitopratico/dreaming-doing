import { useMemo } from "react";
import { Home, Route } from "lucide-react";
import { inferProjectRoutes } from "@/lib/project-routes";

interface PreviewRouteNavProps {
  files: Array<{ path: string; content?: string }>;
  activePath: string;
  onNavigate: (path: string) => void;
  devUrl?: string | null;
}

export function PreviewRouteNav({
  files,
  activePath,
  onNavigate,
  devUrl,
}: PreviewRouteNavProps) {
  const routes = useMemo(() => {
    const paths = files.map((f) => f.path);
    const contents = new Map(files.map((f) => [f.path.replace(/^\//, ""), f.content ?? ""]));
    return inferProjectRoutes(paths, contents);
  }, [files]);

  if (!devUrl || routes.length <= 1) return null;

  return (
    <nav
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-black/10 bg-white/95 px-3 py-2"
      aria-label="Páginas do app"
    >
      <span className="mr-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-neutral-500 shrink-0">
        <Route className="size-3" />
        Rotas
      </span>
      {routes.map((r) => {
        const active = activePath === r.path;
        return (
          <button
            key={r.path}
            type="button"
            onClick={() => onNavigate(r.path)}
            className={`shrink-0 rounded-md px-2.5 py-1 font-mono text-[10px] transition-colors ${
              active
                ? "bg-[var(--forge-primary)] text-black font-medium"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {r.path === "/" ? (
              <span className="inline-flex items-center gap-1">
                <Home className="size-3" />
                {r.label}
              </span>
            ) : (
              r.label
            )}
          </button>
        );
      })}
    </nav>
  );
}