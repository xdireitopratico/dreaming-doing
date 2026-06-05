import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ChevronDown, Copy, Globe, Home, Lock, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { inferProjectRoutes, buildPreviewUrl } from "@/lib/project-routes";

interface PreviewRouteNavProps {
  files: Array<{ path: string; content?: string }>;
  activePath: string;
  onNavigate: (path: string) => void;
  devUrl?: string | null;
  onRefresh?: () => void;
}

function normalizeRouteInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  const pathOnly = trimmed.replace(/^https?:\/\/[^/]+/i, "");
  const withSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  try {
    const u = new URL(withSlash, "https://preview.local");
    return u.pathname || "/";
  } catch {
    return withSlash.split("?")[0]?.split("#")[0] || "/";
  }
}

export function PreviewRouteNav({
  files,
  activePath,
  onNavigate,
  devUrl,
  onRefresh,
}: PreviewRouteNavProps) {
  const routes = useMemo(() => {
    const paths = files.map((f) => f.path);
    const contents = new Map(files.map((f) => [f.path.replace(/^\//, ""), f.content ?? ""]));
    const inferred = inferProjectRoutes(paths, contents);
    if (inferred.length > 0) return inferred;
    return [{ path: "/", label: "Início" }];
  }, [files]);

  const [draft, setDraft] = useState(activePath);

  useEffect(() => {
    setDraft(activePath);
  }, [activePath]);

  const canNavigate = Boolean(devUrl);
  const previewHost = useMemo(() => {
    if (!devUrl) return "preview";
    try {
      return new URL(devUrl).host;
    } catch {
      return devUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "preview";
    }
  }, [devUrl]);

  const iframeSrc = devUrl ? buildPreviewUrl(devUrl, activePath) : null;

  const commitPath = () => {
    const next = normalizeRouteInput(draft);
    setDraft(next);
    onNavigate(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitPath();
      (e.target as HTMLInputElement).blur();
    }
  };

  const copyPreviewLink = () => {
    if (!iframeSrc) return;
    void navigator.clipboard.writeText(iframeSrc).then(
      () => toast.success("Link do preview copiado"),
      () => toast.info(iframeSrc),
    );
  };

  return (
    <div className="forge-address-bar" role="navigation" aria-label="Navegação do preview">
      <span className="forge-address-bar-scheme" title={canNavigate ? previewHost : "Preview local"}>
        {canNavigate ? (
          <Lock className="size-3 text-[var(--forge-primary)]/80" aria-hidden />
        ) : (
          <Globe className="size-3 text-[var(--forge-ghost)]" aria-hidden />
        )}
        <span className="forge-address-bar-host">{previewHost}</span>
      </span>

      <input
        type="text"
        className="forge-address-bar-input"
        value={draft}
        spellCheck={false}
        aria-label="Caminho da página"
        placeholder="/"
        title={
          canNavigate
            ? "Digite o caminho e pressione Enter"
            : "Disponível quando o sandbox E2B subir"
        }
        disabled={!canNavigate}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commitPath}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="forge-address-bar-pages-btn" title="Páginas do app">
            <span className="sr-only">Páginas</span>
            <ChevronDown className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side="bottom"
          sideOffset={6}
          className="forge-dropdown-panel z-[200] max-h-48 min-w-[160px] overflow-y-auto border-[var(--forge-border-strong)] bg-[var(--forge-surface-2)] p-1"
        >
          {routes.map((r) => (
            <DropdownMenuItem
              key={r.path}
              className={`forge-dropdown-item cursor-pointer font-mono text-[10px] focus:bg-[var(--forge-surface-3)] ${
                activePath === r.path ? "text-[var(--forge-primary)]" : "text-[var(--forge-silver)]"
              }`}
              onClick={() => {
                setDraft(r.path);
                if (canNavigate) onNavigate(r.path);
              }}
            >
              {r.path === "/" ? <Home className="size-3 mr-1.5 shrink-0" /> : null}
              <span className="text-[var(--forge-ghost)]">{r.path}</span>
              <span className="ml-auto text-[var(--forge-muted)]">{r.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {canNavigate && iframeSrc && (
        <button
          type="button"
          className="forge-address-bar-action"
          title="Copiar URL"
          onClick={copyPreviewLink}
        >
          <Copy className="size-3.5" />
        </button>
      )}
      {canNavigate && onRefresh && (
        <button
          type="button"
          className="forge-address-bar-action"
          title="Recarregar preview"
          onClick={onRefresh}
        >
          <RefreshCw className="size-3.5" />
        </button>
      )}
    </div>
  );
}