import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { PreviewRouteNav } from "@/components/editor/PreviewRouteNav";
import { E2bSandboxPanel } from "@/components/editor/E2bSandboxPanel";
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
  warming?: boolean;
  onWarmComplete?: () => void;
  agentHasRun?: boolean;
  e2bConnected?: boolean;
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
  warming = false,
  onWarmComplete,
  agentHasRun = false,
  e2bConnected = true,
}: PreviewFrameProps) {
  const [iframeLoading, setIframeLoading] = useState(false);

  useEffect(() => {
    if (devUrl) setIframeLoading(true);
  }, [devUrl]);

  useEffect(() => {
    if (!warming || !devUrl) return;
    setIframeLoading(true);
    const t = window.setTimeout(() => onWarmComplete?.(), 45_000);
    return () => window.clearTimeout(t);
  }, [warming, devUrl, onWarmComplete]);

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

  const waitingForAgent = isReactProject && !devUrl && !bootError && !running;
  const needsE2b = !e2bConnected;
  const e2bBootBlocked =
    needsE2b ||
    (!!bootError && (bootError.includes("E2B") || bootError.includes("Sandbox")));

  return (
    <div className="forge-preview-root">
      <PreviewRouteNav
        files={files}
        activePath={previewPath}
        onNavigate={(p) => onPreviewPathChange?.(p)}
        devUrl={devUrl}
      />

      <div className="forge-preview-viewport">
        {e2bBootBlocked && !running && !devUrl && (
          <E2bSandboxPanel connected={e2bConnected} />
        )}

        {bootError && !running && !e2bBootBlocked && (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white p-8 text-center">
            <p className="text-sm text-neutral-700 max-w-sm leading-relaxed">{bootError}</p>
            {onRefresh && bootError.includes("agente") && (
              <p className="text-xs text-neutral-400">Peça uma alteração no chat para a IA começar.</p>
            )}
            {onRefresh && !bootError.includes("agente") && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Tentar de novo
              </button>
            )}
          </div>
        )}

        {!bootError && running ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white">
            <Loader2 className="size-8 animate-spin text-neutral-400" />
            <p className="text-sm text-neutral-500">A IA está trabalhando…</p>
          </div>
        ) : !bootError && iframeSrc ? (
          <>
            {(warming || iframeLoading) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/90">
                <Loader2 className="size-6 animate-spin text-neutral-400" />
                <p className="text-xs text-neutral-500">Carregando preview…</p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={iframeSrc}
              src={iframeSrc}
              className="forge-preview-frame absolute inset-0 h-full w-full"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="Preview"
              onLoad={() => {
                setIframeLoading(false);
                onWarmComplete?.();
              }}
            />
          </>
        ) : !bootError && previewContent ? (
          <iframe
            srcDoc={previewContent}
            className="forge-preview-frame absolute inset-0 h-full w-full"
            sandbox="allow-scripts"
            title="Preview"
          />
        ) : !bootError && waitingForAgent ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-white p-8 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-neutral-100">
              <Eye className="size-6 text-neutral-400" />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-medium text-neutral-800">Preview ao vivo</p>
              <p className="text-sm text-neutral-500 leading-relaxed">
                Aparece aqui quando a IA começar a programar. Um ambiente por projeto — sem surpresas.
              </p>
            </div>
          </div>
        ) : !bootError && isReactProject && onRefresh ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-white p-8 text-center">
            <Eye className="size-8 text-neutral-300" />
            <p className="text-sm text-neutral-500 max-w-xs">
              {agentHasRun
                ? "Sincronizando o preview com o código mais recente."
                : "Envie um pedido no chat para abrir o preview."}
            </p>
            {agentHasRun && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Abrir preview
              </button>
            )}
          </div>
        ) : !bootError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-white">
            <Eye className="size-8 text-neutral-300" />
            <p className="text-sm text-neutral-500">O preview aparece quando houver algo para mostrar.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}