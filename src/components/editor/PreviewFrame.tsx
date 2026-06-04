// PreviewFrame.tsx — Preview iframe ao vivo + toolbar + device frames + console toggle
// Dual mode: srcdoc (HTML vanilla) ou iframe url (dev server ou deploy)
import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor, Smartphone, Tablet, ExternalLink, RefreshCw,
  Eye, Terminal, Loader2, Copy, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DeviceMode = "desktop" | "tablet" | "mobile";
type TabMode = "preview" | "console";

interface PreviewFrameProps {
  files: Array<{ path: string; content: string }>;
  running: boolean;
  devUrl?: string | null;
  onRefresh?: () => void;
}

const DEVICE_DIMENSIONS: Record<DeviceMode, { width: string; maxWidth: string }> = {
  desktop: { width: "100%", maxWidth: "100%" },
  tablet: { width: "100%", maxWidth: "768px" },
  mobile: { width: "100%", maxWidth: "375px" },
};

export function PreviewFrame({ files, running, devUrl, onRefresh }: PreviewFrameProps) {
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [activeTab, setActiveTab] = useState<TabMode>("preview");
  const [copied, setCopied] = useState(false);

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
    if (devUrl) return null; // usa iframe com URL
    if (indexFile) return indexFile.content;
    return null;
  }, [devUrl, indexFile]);

  const handleCopyUrl = useCallback(() => {
    if (devUrl) {
      navigator.clipboard.writeText(devUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [devUrl]);

  const handleOpenExternal = () => {
    if (devUrl) window.open(devUrl, "_blank");
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between h-9 px-3 bg-[var(--surface-1)] border-b border-[var(--border)] shrink-0">
        {/* Left: device picker */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setDevice("mobile")}
            className={cn(
              "p-1.5 rounded transition-colors",
              device === "mobile"
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "text-[var(--text-ghost)] hover:text-[var(--text-dim)]",
            )}
            title="Mobile (375px)"
          >
            <Smartphone className="size-3.5" />
          </button>
          <button
            onClick={() => setDevice("tablet")}
            className={cn(
              "p-1.5 rounded transition-colors",
              device === "tablet"
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "text-[var(--text-ghost)] hover:text-[var(--text-dim)]",
            )}
            title="Tablet (768px)"
          >
            <Tablet className="size-3.5" />
          </button>
          <button
            onClick={() => setDevice("desktop")}
            className={cn(
              "p-1.5 rounded transition-colors",
              device === "desktop"
                ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                : "text-[var(--text-ghost)] hover:text-[var(--text-dim)]",
            )}
            title="Desktop"
          >
            <Monitor className="size-3.5" />
          </button>
        </div>

        {/* Center: tab switcher */}
        <div className="flex items-center gap-0.5 bg-[var(--surface-2)]/50 rounded-md p-0.5">
          <button
            onClick={() => setActiveTab("preview")}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
              activeTab === "preview"
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--text-dim)] hover:text-[var(--foreground)]",
            )}
          >
            <Eye className="size-3" /> Preview
          </button>
          <button
            onClick={() => setActiveTab("console")}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors",
              activeTab === "console"
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--text-dim)] hover:text-[var(--foreground)]",
            )}
          >
            <Terminal className="size-3" /> Console
          </button>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-0.5">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded text-[var(--text-ghost)] hover:text-[var(--text-dim)] transition-colors"
              title="Recarregar preview"
            >
              <RefreshCw className="size-3.5" />
            </button>
          )}
          {devUrl && (
            <>
              <button
                onClick={handleCopyUrl}
                className="p-1.5 rounded text-[var(--text-ghost)] hover:text-[var(--text-dim)] transition-colors"
                title="Copiar URL"
              >
                {copied ? (
                  <CheckCheck className="size-3.5 text-[var(--success)]" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
              <button
                onClick={handleOpenExternal}
                className="p-1.5 rounded text-[var(--text-ghost)] hover:text-[var(--text-dim)] transition-colors"
                title="Abrir em nova aba"
              >
                <ExternalLink className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === "preview" ? (
            <motion.div
              key="preview-pane"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-[var(--background)]"
            >
              {/* Device frame */}
              <div
                className="h-full flex items-center justify-center transition-all duration-300"
                style={{
                  width: DEVICE_DIMENSIONS[device].width,
                  maxWidth: DEVICE_DIMENSIONS[device].maxWidth,
                }}
              >
                <div
                  className={cn(
                    "w-full h-full border border-[var(--border)] shadow-[0_0_60px_-20px_rgba(255,182,39,0.15)] overflow-hidden transition-all duration-300 bg-white",
                    device === "mobile" && "rounded-[32px] border-4 border-[var(--surface-2)] max-h-[812px]",
                    device === "tablet" && "rounded-[20px] border-4 border-[var(--surface-2)] max-h-[1024px]",
                    device === "desktop" && "rounded-none border-0",
                  )}
                >
                  {running ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 bg-[var(--background)]">
                      <Loader2 className="size-8 text-[var(--primary)] animate-spin" />
                      <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)]">
                        COMPILING
                      </span>
                    </div>
                  ) : devUrl ? (
                    <iframe
                      src={devUrl}
                      className="w-full h-full"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      title="Preview"
                    />
                  ) : previewContent ? (
                    <iframe
                      srcDoc={previewContent}
                      className="w-full h-full"
                      sandbox="allow-scripts"
                      title="Preview"
                    />
                  ) : isReactProject ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 bg-[var(--background)] p-6 text-center">
                      <div className="size-16 rounded-full bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center">
                        <Monitor className="size-6 text-[var(--text-ghost)]" />
                      </div>
                      <div>
                        <p className="text-sm font-display text-[var(--text-dim)]">
                          Projeto React detectado
                        </p>
                        <p className="text-[10px] font-mono text-[var(--text-ghost)] mt-1">
                          Inicie o dev server para ver o preview ao vivo
                        </p>
                      </div>
                      <button
                        onClick={onRefresh}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-mono hover:bg-[var(--primary-hot)] transition-colors"
                      >
                        npm run dev
                      </button>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-3 bg-[var(--background)]">
                      <div className="size-16 rounded-full bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center">
                        <Eye className="size-6 text-[var(--text-ghost)]" />
                      </div>
                      <p className="text-sm font-display text-[var(--text-dim)]">
                        Aguardando código
                      </p>
                      <p className="text-[10px] font-mono text-[var(--text-ghost)]">
                        O preview aparecerá quando o agente criar o primeiro arquivo
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="console-pane"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[var(--surface-1)] p-4 overflow-y-auto"
            >
              <div className="font-mono text-xs space-y-1 text-[var(--text-dim)]">
                <p className="text-[var(--text-ghost)] italic mb-3">
                  Console do preview — erros e logs aparecem aqui durante a execução
                </p>
                <p>
                  <span className="text-[var(--text-ghost)]">{">"}</span>{" "}
                  Preview inicializado
                </p>
                <p>
                  <span className="text-[var(--text-ghost)]">{">"}</span>{" "}
                  Aguardando build...
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
