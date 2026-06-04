// AgentPanel.tsx — SSE: fases, tools, custo, timeline, runtime checks
// Integrado ao chat como indicador de progresso visível
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, FolderOpen, Zap, Eye, CheckCircle2, XCircle,
  Loader2, Wrench, DollarSign, Brain, Puzzle,
} from "lucide-react";
import type { AgentProgress, SSEEvent } from "@/hooks/useSSE";

interface AgentPanelProps {
  running: boolean;
  progress: AgentProgress;
}

const PHASE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  gather: FolderOpen,
  classify: Search,
  plan: Brain,
  execute: Zap,
  observe: Eye,
  summarize: CheckCircle2,
};

const PHASE_LABELS: Record<string, string> = {
  gather: "Analisando projeto",
  classify: "Classificando",
  plan: "Planejando",
  execute: "Executando",
  observe: "Observando",
  summarize: "Finalizando",
};

export function AgentPanel({ running, progress }: AgentPanelProps) {
  const phaseIcon = PHASE_ICONS[progress.phase ?? ""] ?? Zap;
  const PhaseIcon = phaseIcon;

  return (
    <div className="flex flex-col gap-1">
      <AnimatePresence mode="wait">
        {running && (
          <motion.div
            key="agent-progress"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mx-3 mt-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] p-3 space-y-2.5">
              {/* Phase indicator */}
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-md bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
                  <PhaseIcon className="size-3.5 text-[var(--primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-mono text-[var(--primary)] tracking-wider uppercase">
                    {PHASE_LABELS[progress.phase ?? ""] ?? progress.phase}
                  </p>
                  {progress.message && (
                    <p className="text-[10px] text-[var(--text-dim)] truncate">
                      {progress.message}
                    </p>
                  )}
                </div>
                {progress.currentStep && progress.totalSteps && (
                  <span className="font-mono text-[10px] text-[var(--text-dim)]">
                    {progress.currentStep}/{progress.totalSteps}
                  </span>
                )}
              </div>

              {/* Active tools */}
              {progress.tools.length > 0 && (
                <div className="space-y-1">
                  {progress.tools.slice(-3).map((tool, i) => (
                    <div
                      key={`${tool.name}-${i}`}
                      className="flex items-center gap-2 text-[10px] font-mono"
                    >
                      {tool.ok === undefined ? (
                        <Loader2 className="size-3 text-[var(--primary)] animate-spin" />
                      ) : tool.ok ? (
                        <CheckCircle2 className="size-3 text-[var(--success)]" />
                      ) : (
                        <XCircle className="size-3 text-[var(--destructive)]" />
                      )}
                      <span className="text-[var(--primary)]">
                        {tool.name}
                      </span>
                      <span className="text-[var(--text-dim)] truncate">
                        {formatToolArgs(tool.args)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Divider + info row */}
              <div className="border-t border-[var(--border)] pt-2 flex items-center gap-3 text-[9px] font-mono text-[var(--text-ghost)]">
                {/* Model */}
                {progress.model && (
                  <span className="flex items-center gap-1">
                    <Brain className="size-3" />
                    {progress.model}
                  </span>
                )}

                {/* Cost */}
                <span className="flex items-center gap-1">
                  <DollarSign className="size-3" />${progress.cost.toFixed(4)}
                </span>

                {/* Skills */}
                {progress.skills.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Puzzle className="size-3" />
                    {progress.skills.length} skill{progress.skills.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Runtime checks */}
              {progress.runtimeChecks.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {progress.runtimeChecks.map((check, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono ${
                        check.ok
                          ? "bg-[var(--success)]/10 text-[var(--success)]"
                          : "bg-[var(--destructive)]/10 text-[var(--destructive)]"
                      }`}
                    >
                      {check.ok ? (
                        <CheckCircle2 className="size-2.5" />
                      ) : (
                        <XCircle className="size-2.5" />
                      )}
                      {check.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Error state */}
        {progress.error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-3 rounded-lg bg-[var(--destructive)]/10 border border-[var(--destructive)]/30 p-3"
          >
            <p className="text-[11px] font-mono text-[var(--destructive)]">
              Erro: {progress.error}
            </p>
          </motion.div>
        )}

        {/* Finished indicator */}
        {progress.finished && !progress.error && progress.summary && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-3 rounded-lg bg-[var(--success)]/10 border border-[var(--success)]/20 p-2 flex items-center gap-2"
          >
            <CheckCircle2 className="size-3.5 text-[var(--success)]" />
            <span className="text-[10px] font-mono text-[var(--success)] uppercase tracking-wider">
              Concluído
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatToolArgs(args: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return "";
  const relevant = args.path ?? args.command ?? args.pattern ?? args.sql ?? "";
  const str = typeof relevant === "string" ? relevant : JSON.stringify(relevant);
  return str.length > 40 ? str.slice(0, 37) + "..." : str;
}
