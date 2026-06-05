import { useMemo } from "react";
import { Eye, Loader2 } from "lucide-react";
import { PreviewRouteNav } from "@/components/editor/PreviewRouteNav";
import { buildPreviewUrl } from "@/lib/project-routes";

interface PreviewFrameProps {
  files: Array<{ path: string; content: string }>;
  running: boolean;
  devUrl?: string | null;
  previewPath?: string;
  onPreviewPathChange?: (path: string) => void;
  onRefresh?: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  bootError?: string | null;
}

export function PreviewFrame({
  files,
  running,
  devUrl,
  previewPath = "/",
  onPreviewPathChange,
  onRefresh,
  iframeRef,
  bootError,
}: PreviewFrameProps) {
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

  const iframeSrc = useMemo(() => {
    if (!devUrl) return null;
    return buildPreviewUrl(devUrl, previewPath);
  }, [devUrl, previewPath]);

  const previewContent = useMemo(() => {
    if (devUrl) return null;
    if (indexFile) return indexFile.content;
    return null;
  }, [devUrl, indexFile]);

  return (
    <div className="forge-preview-root">
      <PreviewRouteNav
        files={files}
        activePath={previewPath}
        onNavigate={(p) => onPreviewPathChange?.(p)}
        devUrl={devUrl}
      />

      <div className="forge-preview-viewport">
        {bootError && !running && (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white p-6 text-center">
            <p className="text-sm font-medium text-red-600">Preview E2B</p>
            <p className="max-w-md font-mono text-[11px] text-neutral-600 leading-relaxed">
              {bootError}
            </p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-lg bg-[var(--forge-primary)] px-4 py-2 text-sm font-medium text-black"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}

        {!bootError && running ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white">
            <Loader2 className="size-8 animate-spin text-[var(--forge-primary)]" />
            <p className="text-sm text-neutral-500">Iniciando sandbox E2B…</p>
          </div>
        ) : !bootError && iframeSrc ? (
          <iframe
            ref={iframeRef}
            key={iframeSrc}
            src={iframeSrc}
            className="forge-preview-frame absolute inset-0 h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Preview"
          />
        ) : !bootError && previewContent ? (
          <iframe
            srcDoc={previewContent}
            className="forge-preview-frame absolute inset-0 h-full w-full"
            sandbox="allow-scripts"
            title="Preview"
          />
        ) : !bootError && isReactProject ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-white p-8 text-center">
            <p className="text-sm text-neutral-600">
              Projeto React — o preview ao vivo usa sandbox E2B (Vite na porta detectada).
            </p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-lg bg-[var(--forge-primary)] px-4 py-2 text-sm font-medium text-black"
              >
                Iniciar preview
              </button>
            )}
          </div>
        ) : !bootError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white">
            <Eye className="size-8 text-neutral-300" />
            <p className="text-sm text-neutral-500">
              O preview aparece quando o agente criar os arquivos ou você iniciar o sandbox.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}