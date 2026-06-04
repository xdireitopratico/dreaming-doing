// Breadcrumb.tsx — Caminho do arquivo acima do editor
// Ex: src > components > Button.tsx, cada segmento clicável
import { Fragment } from "react";
import { ChevronRight, Home } from "lucide-react";
import { getFileIcon } from "./fileIcons";

interface BreadcrumbProps {
  path: string | null;
  onNavigate?: (path: string) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  if (!path) {
    return (
      <div className="flex items-center h-7 px-3 bg-[var(--surface-1)] border-b border-[var(--border)] shrink-0">
        <Home className="size-3 text-[var(--text-ghost)]" />
      </div>
    );
  }

  const segments = path.split("/");
  const icon = getFileIcon(path);

  return (
    <div className="flex items-center h-7 px-3 bg-[var(--surface-1)] border-b border-[var(--border)] shrink-0 select-none">
      {segments.map((segment, i) => {
        const partialPath = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;

        return (
          <Fragment key={i}>
            {i > 0 && (
              <ChevronRight className="size-3 text-[var(--border)] mx-0.5 shrink-0" />
            )}
            <button
              onClick={() => onNavigate?.(partialPath)}
              className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-mono transition-colors hover:bg-[var(--surface-2)] ${
                isLast
                  ? "text-[var(--foreground)] cursor-default hover:bg-transparent"
                  : "text-[var(--text-dim)]"
              }`}
            >
              {isLast && (
                <span style={{ color: icon?.color ?? "var(--text-dim)" }}>
                  {icon?.label ?? ""}
                </span>
              )}
              <span>{segment}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
