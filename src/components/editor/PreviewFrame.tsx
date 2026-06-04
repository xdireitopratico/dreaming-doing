import { useMemo } from "react";
import { Eye, Loader2 } from "lucide-react";

interface PreviewFrameProps {
  files: Array<{ path: string; content: string }>;
  running: boolean;
  devUrl?: string | null;
  onRefresh?: () => void;
}

export function PreviewFrame({ files, running, devUrl, onRefresh }: PreviewFrameProps) {
  const indexFile = useMemo(() => {
    return files.find(
      (f) =>
        f.path === "index.html" ||
        f.path === "/index.html" ||
        f.path.endsWith("/index.html"),
    );
  }, [files]);

  const isReactProject = useMemo(() => {
    return files.some((f) => f.path === "package.json" || f.path === "/package.json");
  }, [files]);

  const previewContent = useMemo(() => {
    if (devUrl) return null;
    if (indexFile) return indexFile.content;
    return null;
  }, [devUrl, indexFile]);

  return (
    <div className="forge-preview-root">
      <div className="forge-preview-viewport">
        {running ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white">
            <Loader2 className="size-8 animate-spin text-[var(--forge-primary)]" />
            <p className="text-sm text-neutral-500">Construindo preview…</p>
          </div>
        ) : devUrl ? (
          <iframe
            src={devUrl}
            className="forge-preview-frame"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Preview"
          />
        ) : previewContent ? (
          <iframe
            srcDoc={previewContent}
            className="forge-preview-frame"
            sandbox="allow-scripts"
            title="Preview"
          />
        ) : isReactProject ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-white p-8 text-center">
            <p className="text-sm text-neutral-600">Projeto React — inicie o dev server para ver o preview.</p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-lg bg-[var(--forge-primary)] px-4 py-2 text-sm font-medium text-black"
              >
                Atualizar preview
              </button>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white">
            <Eye className="size-8 text-neutral-300" />
            <p className="text-sm text-neutral-500">
              O preview aparece quando o agente criar os arquivos do projeto.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}