// BranchSwitcher.tsx — Visualizador de branches/conversas do projeto
// Cada conversa é um "branch" — navegar entre elas, criar nova
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, GitMerge, Plus, MoreHorizontal, Clock, MessageSquare,
  CheckCircle2, ChevronRight, ArrowRightLeft,
} from "lucide-react";

export interface Branch {
  id: string;
  label: string;
  lastMessage: string;
  createdAt: string;
  isActive: boolean;
  messageCount: number;
}

interface BranchSwitcherProps {
  branches: Branch[];
  activeBranchId: string | null;
  onSwitch: (branchId: string) => void;
  onCreate: () => void;
  onMerge?: (branchId: string) => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 34,
};

export function BranchSwitcher({
  branches,
  activeBranchId,
  onSwitch,
  onCreate,
  onMerge,
}: BranchSwitcherProps) {
  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-1.5">
          <GitBranch className="size-3 text-[var(--primary)]" />
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-[var(--foreground)]">
            Branches
          </span>
        </div>
        <button
          onClick={onCreate}
          className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] hover:text-[var(--foreground)] transition-colors"
          title="Novo branch"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      {/* Branch list */}
      <div className="flex-1 overflow-y-auto py-1">
        {branches.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-[var(--text-ghost)]">
            <GitBranch className="size-5 opacity-30" />
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase">Nenhum branch</span>
            <button
              onClick={onCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)]/10 text-[var(--primary)] font-mono text-[10px] hover:bg-[var(--primary)]/20 transition-colors border border-[var(--primary)]/20"
            >
              <Plus className="size-3" />
              Criar branch
            </button>
          </div>
        ) : (
          branches.map((branch, i) => {
            const isActive = branch.id === activeBranchId;
            return (
              <motion.button
                key={branch.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: i * 0.03 }}
                onClick={() => onSwitch(branch.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
                  isActive
                    ? "border-l-[var(--primary)] bg-[var(--primary)]/5"
                    : "border-l-transparent hover:bg-[var(--surface-2)]/50"
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Active indicator */}
                  <div className={`size-2 rounded-full mt-1 shrink-0 ${
                    isActive ? "bg-[var(--primary)] shadow-sm shadow-[var(--primary)]/30" : "bg-[var(--border)]"
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <GitBranch className={`size-3 ${isActive ? "text-[var(--primary)]" : "text-[var(--text-ghost)]"}`} />
                      <span className={`font-mono text-[10px] truncate ${isActive ? "text-[var(--foreground)]" : "text-[var(--text-dim)]"}`}>
                        {branch.label}
                      </span>
                      {isActive && (
                        <span className="font-mono text-[7px] tracking-[0.15em] uppercase px-1 py-0.5 rounded bg-[var(--primary)]/15 text-[var(--primary)] shrink-0">
                          ATIVO
                        </span>
                      )}
                    </div>

                    <div className="font-mono text-[9px] text-[var(--text-ghost)] mt-1 truncate">
                      {branch.lastMessage.slice(0, 60)}
                    </div>

                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 font-mono text-[8px] text-[var(--text-ghost)]">
                        <MessageSquare className="size-2.5" />
                        {branch.messageCount}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[8px] text-[var(--text-ghost)]">
                        <Clock className="size-2.5" />
                        {new Date(branch.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>

                  {/* Merge button */}
                  {!isActive && onMerge && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onMerge(branch.id); }}
                      className="shrink-0 p-1 rounded hover:bg-[var(--primary)]/10 text-[var(--text-ghost)] hover:text-[var(--primary)] transition-colors"
                      title="Merge"
                    >
                      <GitMerge className="size-3.5" />
                    </button>
                  )}
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
