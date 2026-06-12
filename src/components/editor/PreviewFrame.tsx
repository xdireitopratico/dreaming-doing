import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { previewDeviceWidth, type PreviewDevice } from "@/components/editor/PreviewViewportChrome";
import { buildPreviewUrl } from "@/lib/project-routes";
import { BuildConsole } from "@/components/editor/BuildConsole";
import type { AgentProgress } from "@/lib/agent-progress";
import type { ProjectStackKind } from "@/lib/detect-project-kind";
import { isSeedPlaceholderEntryContent, projectEntryPath } from "@/lib/publish-ready";

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
  /** Agente em execução — iframe atualiza ao vivo quando devUrl existe. */
  agentRunning?: boolean;
  /** Badge/overlay de preview ao vivo durante run (web/expo). */
  previewLiveUpdating?: boolean;
  /** Device viewport controlado pelo header. */
  device?: PreviewDevice;
  /** Quando true, esconde a chrome interna (URL/device/refresh) — usado quando o header já provê. */
  hideChrome?: boolean;
  /** Callback para focar o chat (ex.: build nativo). */
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
  /** android-native / mixed — painel de build em vez de iframe Vite. */
  nativeBuildPreview?: boolean;
  projectStack?: ProjectStackKind | null;
  agentProgress?: AgentProgress | null;
}

type PreviewView =
  | "native-console"
  | "boot-spinner"
  | "preview-idle"
  | "iframe-live"
  | "iframe-srcdoc"
  | "built-app-pending"
  | "stale-reconnect"
  | "lets-build"
  | "empty";

function surfaceClass(...extra: string[]) {
  return ["forge-preview-surface", ...extra].filter(Boolean).join(" ");
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
  agentRunning = false,
  previewLiveUpdating = false,
  device = "desktop",
  onFocusChat,
  previewIdle = false,
  isNoFiles = false,
  isReactProject = false,
  previewSyncing = false,
  sandboxStale = false,
  reconnecting = false,
  nativeBuildPreview = false,
  projectStack = null,
  agentProgress = null,
}: PreviewFrameProps) {
  const [iframeLoading, setIframeLoading] = useState(false);
  const autoBootAttemptedRef = useRef(false);
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
      (f) => f.path === "index.html" || f.path === "/index.html" || f.path.endsWith("/index.html"),
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

  const hasBuiltApp = (agentHasRun || agentRunning) && !isNoFiles;

  const seedPlaceholder = useMemo(() => {
    const entryPath = projectEntryPath(projectStack);
    const entry = files.find(
      (f) =>
        f.path === entryPath || f.path === `/${entryPath}` || f.path.endsWith(`/${entryPath}`),
    );
    return isSeedPlaceholderEntryContent(entry?.content);
  }, [files, projectStack]);

  const showConnecting =
    isReactProject && hasBuiltApp && !devUrl && (booting || warming || previewSyncing);

  const showBootSpinner = (booting && !iframeSrc && (!isNoFiles || agentRunning)) || showConnecting;

  const showReconnecting = reconnecting || (sandboxStale && (booting || warming || previewSyncing));

  const showStaleGuide = sandboxStale && !showReconnecting;

  const showBuiltAppPending =
    hasBuiltApp &&
    !devUrl &&
    !previewContent &&
    !booting &&
    !warming &&
    !showReconnecting &&
    !showStaleGuide;

  const showLetsBuild =
    seedPlaceholder ||
    (!hasBuiltApp &&
      !agentRunning &&
      (showStaleGuide ||
        isNoFiles ||
        (!iframeSrc && !previewContent && !booting && !warming && !showReconnecting)));

  const canShowIframe =
    !nativeBuildPreview &&
    Boolean(iframeSrc) &&
    !sandboxStale &&
    !seedPlaceholder &&
    (!isNoFiles || agentRunning);

  const showNativeConsole = nativeBuildPreview && projectStack === "android-native";

  const view: PreviewView = useMemo(() => {
    if (showNativeConsole) return "native-console";
    if (showBootSpinner || showReconnecting || (bootError && !devUrl)) return "boot-spinner";
    if (previewIdle && devUrl) return "preview-idle";
    if (canShowIframe && iframeSrc) return "iframe-live";
    if (previewContent) return "iframe-srcdoc";
    if (showBuiltAppPending) return "built-app-pending";
    if (showLetsBuild) return showStaleGuide && onRefresh ? "stale-reconnect" : "lets-build";
    return "empty";
  }, [
    showNativeConsole,
    bootError,
    showBootSpinner,
    showReconnecting,
    previewIdle,
    devUrl,
    canShowIframe,
    iframeSrc,
    previewContent,
    showBuiltAppPending,
    showLetsBuild,
    showStaleGuide,
    seedPlaceholder,
    onRefresh,
  ]);

  useEffect(() => {
    if (!showBuiltAppPending || !onRefresh || autoBootAttemptedRef.current) return;
    autoBootAttemptedRef.current = true;
    onRefresh();
  }, [showBuiltAppPending, onRefresh]);

  return (
    <div className="forge-preview-root flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="forge-preview-viewport min-h-0 min-w-0 flex-1"
        data-device={device}
        style={
          deviceWidth
            ? ({ "--forge-preview-device-width": deviceWidth } as React.CSSProperties)
            : undefined
        }
      >
        {view === "native-console" && (
          <div className={surfaceClass()}>
            <BuildConsole
              files={files}
              progress={agentProgress}
              stackKind={projectStack ?? "android-native"}
              agentRunning={agentRunning}
              onFocusChat={onFocusChat}
            />
          </div>
        )}

        {view === "boot-spinner" && (
          <div
            className={surfaceClass(
              "flex w-full flex-col items-center justify-center gap-3 bg-white",
            )}
          >
            <Loader2 className="size-8 animate-spin text-neutral-400" />
            <p className="text-sm text-neutral-500">
              {showReconnecting
                ? "Reconectando preview…"
                : agentRunning
                  ? "Subindo preview ao vivo…"
                  : "Conectando preview…"}
            </p>
            <p className="text-xs text-neutral-400 max-w-xs text-center px-4">
              {showReconnecting
                ? "O ambiente E2B expirou — estamos a subir um novo."
                : agentRunning
                  ? "O iframe atualiza conforme o agente edita os arquivos."
                  : "A atividade do agente aparece só no chat à esquerda."}
            </p>
          </div>
        )}

        {view === "preview-idle" && (
          <div
            className={surfaceClass(
              "flex flex-col items-center justify-center gap-3 bg-neutral-50 p-8 text-center",
            )}
          >
            <p className="text-sm font-medium text-neutral-800">Preview em repouso</p>
            <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
              Sem interação por 10 minutos — o preview foi pausado para economizar recursos. Mova o
              mouse ou clique para reativar.
            </p>
          </div>
        )}

        {view === "iframe-live" && iframeSrc && (
          <div className={surfaceClass("forge-preview-iframe-wrap relative")}>
            {previewLiveUpdating && !previewSyncing && !warming && !iframeLoading ? (
              <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full bg-neutral-900/85 px-3 py-1 text-xs font-medium text-white shadow-sm">
                Preview ao vivo
              </div>
            ) : null}
            {(warming || iframeLoading || previewSyncing) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/90">
                <Loader2 className="size-6 animate-spin text-neutral-400" />
                <p className="text-xs text-neutral-500">
                  {previewSyncing
                    ? agentRunning
                      ? "Atualizando preview ao vivo…"
                      : "Sincronizando preview…"
                    : "Carregando preview…"}
                </p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={`${iframeSrc}-${reloadNonce}`}
              src={iframeSrc}
              className="forge-preview-frame forge-preview-frame--sized min-h-0 flex-1"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              title="Preview"
              onLoad={() => {
                setIframeLoading(false);
                onWarmComplete?.();
              }}
            />
          </div>
        )}

        {view === "iframe-srcdoc" && previewContent && (
          <div className={surfaceClass("forge-preview-iframe-wrap")}>
            <iframe
              srcDoc={previewContent}
              className="forge-preview-frame forge-preview-frame--sized min-h-0 flex-1"
              sandbox="allow-scripts"
              title="Preview"
            />
          </div>
        )}

        {view === "built-app-pending" && (
          <div
            className={surfaceClass(
              "flex w-full flex-col items-center justify-center gap-4 bg-neutral-50 p-8 text-center",
            )}
          >
            <Loader2 className="size-8 text-neutral-400" />
            <div className="max-w-sm space-y-2">
              <p className="text-sm font-medium text-neutral-900">Preview do app construído</p>
              <p className="text-sm text-neutral-500 leading-relaxed">
                O agente já alterou arquivos neste projeto. O preview ao vivo precisa subir no
                sandbox E2B antes de mostrar a landing aqui.
              </p>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
                data-testid="preview-boot-built-app"
              >
                Subir preview agora
              </button>
            )}
          </div>
        )}

        {view === "stale-reconnect" && (
          <div
            className={surfaceClass(
              "flex flex-col items-center justify-center gap-3 bg-neutral-50 p-8 text-center",
            )}
          >
            <p className="text-sm text-neutral-500">Preview desconectado</p>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
              data-testid="preview-stale-reconnect"
            >
              Reconectar preview
            </button>
          </div>
        )}

        {view === "lets-build" && (
          <div className={surfaceClass("bg-[var(--bg-chat)]")} aria-hidden />
        )}
      </div>
    </div>
  );
}