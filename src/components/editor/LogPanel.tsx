// LogPanel.tsx — Painel unificado Terminal / Console / Problems
// Abas: Terminal (build logs), Console (preview output), Problems (diagnostics list)
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Monitor, AlertTriangle, Activity, X, Trash2, ChevronDown,
  Circle, AlertCircle, CheckCircle2, Copy, Maximize2, Minimize2,
} from "lucide-react";
import { getDiagnostics, subscribeDiagnostics, type Diagnostic } from "@/hooks/useDiagnostics";
import { TroubleshootingShotPanel } from "@/components/editor/TroubleshootingShotPanel";
import {
  getTroubleshootingShot,
  subscribeEditorTelemetry,
} from "@/lib/editor-telemetry";

export interface LogEntry {
  id: string;
  type: "info" | "success" | "error" | "warning" | "output";
  message: string;
  timestamp: number;
  source?: string;
}

interface LogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Live logs from agent/build */
  logs?: LogEntry[];
  /** Whether agent is running (shows spinner) */
  running?: boolean;
  /** Aba inicial ao abrir (ex.: atalho de debug) */
  initialTab?: Tab;
}

type Tab = "terminal" | "console" | "problems" | "shot";

export function LogPanel({
  isOpen,
  onClose,
  logs = [],
  running = false,
  initialTab,
}: LogPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "terminal");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [shotHealth, setShotHealth] = useState(() => getTroubleshootingShot().health);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Subscribe to diagnostics
  useEffect(() => {
    const unsub = subscribeDiagnostics((state) => {
      setDiagnostics(state.diagnostics);
    });
    const current = getDiagnostics();
    setDiagnostics(current.diagnostics);
    return unsub;
  }, []);

  useEffect(() => {
    const refresh = () => setShotHealth(getTroubleshootingShot().health);
    refresh();
    return subscribeEditorTelemetry(refresh);
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll, activeTab]);

  // Detect manual scroll up => disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!terminalRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 40);
  }, []);

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "terminal", label: "TERMINAL", icon: <Terminal className="size-3" /> },
    { id: "console", label: "CONSOLE", icon: <Monitor className="size-3" /> },
    {
      id: "problems",
      label: "PROBLEMS",
      icon: <AlertTriangle className="size-3" />,
      badge: diagnostics.filter((d) => d.severity === "error").length,
    },
    {
      id: "shot",
      label: "SHOT",
      icon: <Activity className="size-3" />,
      badge:
        shotHealth === "critical"
          ? 1
          : shotHealth === "degraded"
            ? 1
            : undefined,
    },
  ];

  const height = maximized ? "h-full" : "h-[250px]";

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 36 }}
      className={`${height} flex flex-col border-t border-[var(--border)] bg-[var(--background)] overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center h-8 bg-[var(--surface-1)] border-b border-[var(--border)] shrink-0">
        {/* Tabs */}
        <div className="flex items-center h-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 h-full px-3 text-[9px] font-mono tracking-[0.15em] uppercase transition-colors border-r border-[var(--border)] ${
                activeTab === tab.id
                  ? "bg-[var(--background)] text-[var(--foreground)] border-b-2 border-b-[var(--primary)] -mb-px"
                  : "text-[var(--text-dim)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span
                className={
                  activeTab === tab.id ? "text-[var(--primary)]" : "text-[var(--text-ghost)]"
                }
              >
                {tab.icon}
              </span>
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className="flex items-center justify-center size-4 rounded-full bg-[var(--destructive)]/20 text-[var(--destructive)] text-[8px] font-bold">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 ml-auto pr-1.5">
          {activeTab === "terminal" && (
            <>
              <button
                onClick={() => {/* Copy all */}}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
                title="Copiar tudo"
              >
                <Copy className="size-3" />
              </button>
              <button
                onClick={() => {/* Clear logs */}}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
                title="Limpar"
              >
                <Trash2 className="size-3" />
              </button>
            </>
          )}
          <button
            onClick={() => setMaximized(!maximized)}
            className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
            title={maximized ? "Restaurar" : "Maximizar"}
          >
            {maximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        ref={terminalRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed p-3"
      >
        <AnimatePresence mode="wait">
          {activeTab === "terminal" && (
            <motion.div
              key="terminal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-0.5"
            >
              {/* Welcome banner */}
              <div className="text-[var(--text-ghost)] mb-3 select-none">
                <div>╔══════════════════════════════════════════╗</div>
                <div>║   <span className="text-[var(--primary)]">FORGE Terminal</span> — Build & Agent Logs  ║</div>
                <div>╚══════════════════════════════════════════╝</div>
                <div className="mt-1 opacity-60">$ forge dev --watch</div>
              </div>

              {/* Log entries */}
              {logs.map((entry) => {
                const colors = {
                  info: "text-[var(--text-dim)]",
                  success: "text-emerald-400",
                  error: "text-[var(--destructive)]",
                  warning: "text-amber-400",
                  output: "text-[var(--foreground)]",
                };
                const icons = {
                  info: <Circle className="size-2 fill-current" />,
                  success: <CheckCircle2 className="size-2.5" />,
                  error: <AlertCircle className="size-2.5" />,
                  warning: <AlertTriangle className="size-2.5" />,
                  output: null,
                };
                return (
                  <div
                    key={entry.id}
                    className={`flex items-start gap-2 ${colors[entry.type]} py-0.5`}
                  >
                    <span className="shrink-0 mt-[3px]">{icons[entry.type]}</span>
                    <span className="whitespace-pre-wrap break-all">{entry.message}</span>
                  </div>
                );
              })}

              {/* Running indicator */}
              {running && (
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="flex items-center gap-2 text-[var(--primary)]"
                >
                  <span className="inline-block size-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                  <span className="text-[10px]">FORGE agent running...</span>
                </motion.div>
              )}

              {/* Cursor */}
              {!autoScroll && (
                <button
                  onClick={() => {
                    setAutoScroll(true);
                    if (terminalRef.current) {
                      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                    }
                  }}
                  className="flex items-center gap-1 text-[10px] text-[var(--primary)] hover:underline mt-2"
                >
                  <ChevronDown className="size-3" />
                  Scroll to bottom
                </button>
              )}
            </motion.div>
          )}

          {activeTab === "console" && (
            <motion.div
              key="console"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-1"
            >
              <div className="text-[var(--text-ghost)] mb-3 select-none">
                <span className="text-[var(--text-dim)]">Output do preview do navegador</span>
              </div>
              {logs.filter((l) => l.source === "console").length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-[var(--text-ghost)]">
                  <Monitor className="size-6 opacity-30" />
                  <span className="text-[10px] tracking-[0.15em] uppercase">
                    Console vazio — rode o preview
                  </span>
                </div>
              ) : (
                logs
                  .filter((l) => l.source === "console")
                  .map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-start gap-2 py-0.5 text-[11px] ${
                        entry.type === "error"
                          ? "text-[var(--destructive)]"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      <span className="shrink-0 opacity-40 text-[10px] text-[var(--text-ghost)]">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="whitespace-pre-wrap break-all">{entry.message}</span>
                    </div>
                  ))
              )}
            </motion.div>
          )}

          {activeTab === "shot" && (
            <motion.div
              key="shot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full min-h-[180px]"
            >
              <TroubleshootingShotPanel />
            </motion.div>
          )}

          {activeTab === "problems" && (
            <motion.div
              key="problems"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-0.5"
            >
              {diagnostics.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-[var(--text-ghost)]">
                  <CheckCircle2 className="size-6 text-emerald-400/50" />
                  <span className="text-[10px] tracking-[0.15em] uppercase">
                    NENHUM PROBLEMA DETECTADO
                  </span>
                </div>
              ) : (
                diagnostics.map((diag, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 py-1 px-2 rounded hover:bg-[var(--surface-2)] transition-colors cursor-pointer group"
                  >
                    {diag.severity === "error" ? (
                      <AlertCircle className="size-3.5 text-[var(--destructive)] shrink-0 mt-px" />
                    ) : diag.severity === "warning" ? (
                      <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-px" />
                    ) : (
                      <Circle className="size-3 text-[var(--text-dim)] shrink-0 mt-px" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[var(--text-dim)]">
                          {diag.filePath}:{diag.line}
                        </span>
                        {diag.code && (
                          <span className="font-mono text-[9px] text-[var(--text-ghost)]">
                            {diag.code}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-dim)] mt-0.5 break-words">
                        {diag.message}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status bar */}
      <div className="flex items-center h-6 px-3 bg-[var(--surface-1)] border-t border-[var(--border)] shrink-0">
        {running && (
          <span className="flex items-center gap-1.5 font-mono text-[8px] text-[var(--primary)] animate-pulse">
            <span className="size-1.5 rounded-full bg-[var(--primary)]" />
            LIVE
          </span>
        )}
        <span className="ml-auto font-mono text-[8px] text-[var(--text-ghost)]">
          {activeTab === "problems"
            ? `${diagnostics.length} problema${diagnostics.length !== 1 ? "s" : ""}`
            : activeTab === "shot"
              ? `health: ${getTroubleshootingShot().health} · ${getTroubleshootingShot().score}/100`
              : `${logs.length} entrada${logs.length !== 1 ? "s" : ""}`}
        </span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Helper to generate log entries from agent SSE events
// ---------------------------------------------------------------------------

let _logIdCounter = 0;
export function createLogEntry(
  type: LogEntry["type"],
  message: string,
  source?: string,
): LogEntry {
  return {
    id: `log-${++_logIdCounter}`,
    type,
    message,
    timestamp: Date.now(),
    source,
  };
}
