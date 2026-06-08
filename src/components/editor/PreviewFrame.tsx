import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { PreviewEmptyGuide } from "@/components/editor/PreviewEmptyGuide";
import {
  previewDeviceWidth,
  type PreviewDevice,
} from "@/components/editor/PreviewViewportChrome";
import { buildPreviewUrl } from "@/lib/project-routes";

interface PreviewFrameProps {
  files: Array<{ path: string; content: string }>;
  /** Só boot E2B — preview permanece estático enquanto o agente trabalha no chat. */
  booting?: boolean;
  devUrl?: string | null;
  previewPath?: string;
  onRefresh?: () => void;
  /** Incrementa para recarregar o iframe após sync de arquivos (sem botão manual). */
  reloadNonce?: number;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  bootError?: string | null;
  warming?: boolean;
  onWarmComplete?: () => void;
  agentHasRun?: boolean;
  e2bConnected?: boolean;
  projectName?: string;
  /** Agente em execução — preview permanece estático (sem loader E2B). */
  agentRunning?: boolean;
  /** Device viewport controlado pelo header. */
  device?: PreviewDevice;
  /** Quando true, esconde a chrome interna (URL/device/refresh) — usado quando o header já provê. */
  hideChrome?: boolean;
  /** Callback para importar repositório do GitHub a partir do estado vazio. */
  onImportRepo?: (repoUrl: string) => void;
  /** Callback para focar o chat a partir do estado vazio. */
  onFocusChat?: () => void;
  /** Repouso após inatividade — iframe descarregado para economizar E2B. */
  previewIdle?: boolean;
  /** Re-sync E2B em curso (ficheiros mudaram, devUrl já existe). */
  previewSyncing?: boolean;
  /** Projeto sem arquivos — não tenta criar sandbox, mostra placeholder limpo. */
  isNoFiles?: boolean;
  /** Vite/React: srcDoc do seed é inútil sem bundler — mostrar Let's Build até devUrl. */
  isReactProject?: boolean;
  /** Sandbox E2B expirou — não mostrar iframe com erro cru da E2B. */
  sandboxStale?: boolean;
  /** Reconexão em curso após sandbox expirado — spinner, não Let's Build. */
  reconnecting?: boolean;
}

export function PreviewFrame({
  files,
  booting = false,
  devUrl,
  previewPath = "/",
  onRefresh,
  reloadNonce = 0,
  iframeRef,
  bootError,
  warming = false,
  onWarmComplete,
  agentHasRun = false,
  e2bConnected = true,
  projectName,
  agentRunning = false,
  device = "desktop",
  onImportRepo,
  onFocusChat,
  previewIdle = false,
  isNoFiles = false,
  isReactProject = false,
  previewSyncing = false,
  sandboxStale = false,
  reconnecting = false,
}: PreviewFrameProps) {
  const [iframeLoading, setIframeLoading] = useState(false);
  const deviceWidth = previewDeviceWidth(device);

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

  const iframeSrc = useMemo(() => {
    if (!devUrl || previewIdle) return null;
    return buildPreviewUrl(devUrl, previewPath);
  }, [devUrl, previewPath, previewIdle]);

  const previewContent = useMemo(() => {
    if (devUrl) return null;
    if (isReactProject) return null;
    if (indexFile) return indexFile.content;
    return null;
  }, [devUrl, indexFile, isReactProject]);

  const showConnecting =
    isReactProject &&
    agentHasRun &&
    !devUrl &&
    !isNoFiles &&
    (booting || warming || previewSyncing);

  const showBootSpinner =
    (booting && !agentRunning && !iframeSrc && !isNoFiles) || showConnecting;

  const showReconnecting = reconnecting || (sandboxStale && (booting || warming || previewSyncing));

  const showStaleGuide = sandboxStale && !showReconnecting;

  const showLetsBuild =
    showStaleGuide ||
    isNoFiles ||
    (!iframeSrc && !previewContent && !booting && !warming && !showReconnecting);

  const canShowIframe =
    Boolean(iframeSrc) && !sandboxStale && !isNoFiles;

  return (
    <div className="forge-preview-root flex min-h-0 flex-1 flex-col">
      <div
        className="forge-preview-viewport min-h-0 flex-1"
        data-device={device}
        style={deviceWidth ? ({ "--forge-preview-device-width": deviceWidth } as React.CSSProperties) : undefined}
      >
        {bootError && !showBootSpinner && (
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
                data-testid="preview-retry"
              >
                Tentar de novo
              </button>
            )}
          </div>
        )}

        {!bootError && (showBootSpinner || showReconnecting) ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-white">
            <Loader2 className="size-8 animate-spin text-neutral-400" />
            <p className="text-sm text-neutral-500">
              {showReconnecting ? "Reconectando preview…" : "Conectando preview…"}
            </p>
            <p className="text-xs text-neutral-400 max-w-xs">
              {showReconnecting
                ? "O ambiente E2B expirou — estamos a subir um novo."
                : "A atividade do agente aparece só no chat à esquerda."}
            </p>
          </div>
        ) : !bootError && previewIdle && devUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-50 p-8 text-center">
            <p className="text-sm font-medium text-neutral-800">Preview em repouso</p>
            <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
              Sem interação por 10 minutos — o preview foi pausado para economizar recursos.
              Mova o mouse ou clique para reativar.
            </p>
          </div>
        ) : !bootError && canShowIframe && iframeSrc ? (
          <>
            {(warming || iframeLoading || previewSyncing) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/90">
                <Loader2 className="size-6 animate-spin text-neutral-400" />
                <p className="text-xs text-neutral-500">
                  {previewSyncing ? "Sincronizando preview…" : "Carregando preview…"}
                </p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={`${iframeSrc}-${reloadNonce}`}
              src={iframeSrc}
              className="forge-preview-frame forge-preview-frame--sized"
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
            className="forge-preview-frame forge-preview-frame--sized"
            sandbox="allow-scripts"
            title="Preview"
          />
        ) : !bootError && showLetsBuild ? (
          <PreviewEmptyGuide
            projectName={projectName}
            e2bConnected={e2bConnected}
            agentHasRun={agentHasRun}
            staleSandbox={sandboxStale}
            onOpenPreview={onRefresh}
            onImportRepo={onImportRepo}
            onFocusChat={onFocusChat}
          />
        ) : null}
      </div>
    </div>
  );
}
