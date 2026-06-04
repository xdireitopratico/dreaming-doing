// StatusBar.tsx — Barra inferior: git status, build status, custo, modelo ativo, skills
// Todos os itens são botões clicáveis que expandem detalhes
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, ArrowUp, ArrowDown, CheckCircle2, XCircle,
  DollarSign, Brain, Puzzle, Wifi, WifiOff, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  gitBranch: string;
  gitAhead: number;
  gitBehind: number;
  buildStatus: "ok" | "fail" | "pending" | null;
  cost: number;
  model: string | null;
  skills: string[];
  connected: boolean;
  onToggleTerminal: () => void;
  onToggleGitPanel: () => void;
}

export function StatusBar({
  gitBranch,
  gitAhead,
  gitBehind,
  buildStatus,
  cost,
  model,
  skills,
  connected,
  onToggleTerminal,
  onToggleGitPanel,
}: StatusBarProps) {
  const [expandedCost, setExpandedCost] = useState(false);

  return (
    <div className="flex items-center h-7 bg-[var(--background)] border-t border-[var(--border)] px-2 gap-0.5 text-[10px] font-mono select-none shrink-0">
      {/* Git */}
      <button
        onClick={onToggleGitPanel}
        className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--surface-2)] transition-colors text-[var(--text-dim)] hover:text-[var(--foreground)]"
      >
        <GitBranch className="size-3" />
        <span className="text-[var(--foreground)]">{gitBranch}</span>
        {gitAhead > 0 && (
          <span className="flex items-center gap-0.5 text-[var(--success)]">
            <ArrowUp className="size-2.5" />
            {gitAhead}
          </span>
        )}
        {gitBehind > 0 && (
          <span className="flex items-center gap-0.5 text-[var(--destructive)]">
            <ArrowDown className="size-2.5" />
            {gitBehind}
          </span>
        )}
      </button>

      <span className="text-[var(--text-ghost)] mx-0.5">·</span>

      {/* Build */}
      {buildStatus && (
        <span
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded",
            buildStatus === "ok" && "text-[var(--success)]",
            buildStatus === "fail" && "text-[var(--destructive)]",
            buildStatus === "pending" && "text-[var(--primary)]",
          )}
        >
          {buildStatus === "ok" ? (
            <CheckCircle2 className="size-3" />
          ) : buildStatus === "fail" ? (
            <XCircle className="size-3" />
          ) : (
            <Circle className="size-3" />
          )}
          build
        </span>
      )}

      <span className="text-[var(--text-ghost)] mx-0.5">·</span>

      {/* Cost — expand on click */}
      <div className="relative">
        <button
          onClick={() => setExpandedCost(!expandedCost)}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--surface-2)] transition-colors text-[var(--text-dim)] hover:text-[var(--foreground)]"
        >
          <DollarSign className="size-3 text-[var(--primary)]" />
          <span className="text-[var(--foreground)]">${cost.toFixed(3)}</span>
        </button>

        <AnimatePresence>
          {expandedCost && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExpandedCost(false)} />
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-0 mb-1 z-50 min-w-[200px] bg-[var(--surface-1)] border border-[var(--border)] rounded-lg shadow-xl backdrop-blur-xl p-3 space-y-2"
              >
                <p className="text-[11px] font-display text-[var(--foreground)]">
                  Custo estimado
                </p>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Esta sessão</span>
                    <span className="text-[var(--foreground)]">${cost.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Modelo</span>
                    <span className="text-[var(--text-ghost)]">{model ?? "?"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-dim)]">Economia Router</span>
                    <span className="text-[var(--success)]">~67%</span>
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-1.5 text-[9px] text-[var(--text-ghost)]">
                  Custo real via API do provedor
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Model */}
      {model && (
        <>
          <span className="text-[var(--text-ghost)] mx-0.5">·</span>
          <span className="flex items-center gap-1 px-2 py-0.5 text-[var(--text-dim)]">
            <Brain className="size-3" />
            <span>{model}</span>
          </span>
        </>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <>
          <span className="text-[var(--text-ghost)] mx-0.5">·</span>
          <span className="flex items-center gap-1 px-2 py-0.5 text-[var(--text-dim)]">
            <Puzzle className="size-3" />
            <span>
              {skills.length} skill{skills.length > 1 ? "s" : ""}
            </span>
          </span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Connection indicator */}
      <span
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded text-[10px]",
          connected
            ? "text-[var(--success)]"
            : "text-[var(--text-ghost)]",
        )}
      >
        {connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
        <span className="hidden md:inline">{connected ? "LIVE" : "OFFLINE"}</span>
      </span>
    </div>
  );
}
