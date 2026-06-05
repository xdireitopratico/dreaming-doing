// AuditLog.tsx — Tabela de execuções com filtros, status, custo
// Mostra histórico de agent runs com detalhes expansíveis
import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, Search, Filter, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, AlertCircle, Clock, Zap, DollarSign, Activity,
  Layers, Code2, BarChart3,
} from "lucide-react";

export interface AuditEntry {
  id: string;
  projectId: string;
  projectName: string;
  provider: string;
  model: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed" | "stopped";
  steps: number;
  cost: number;
  toolsUsed: string[];
  error?: string;
  summary?: string;
}

interface AuditLogProps {
  entries: AuditEntry[];
  selectedId?: string | null;
  onSelect?: (entry: AuditEntry) => void;
}

const spring = {
  type: "spring" as const,
  stiffness: 500,
  damping: 34,
};

type AuditFilter = "all" | "completed" | "failed" | "running" | "stopped";

export function AuditLog({ entries, selectedId, onSelect }: AuditLogProps) {
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== "all") {
      list = list.filter((e) => e.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.projectName.toLowerCase().includes(q) ||
          e.provider.toLowerCase().includes(q) ||
          e.model.toLowerCase().includes(q) ||
          e.toolsUsed.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [entries, filter, search]);

  const totalCost = filtered.reduce((sum, e) => sum + e.cost, 0);
  const totalSteps = filtered.reduce((sum, e) => sum + e.steps, 0);

  const statusConfig = {
    running: { icon: Activity, color: "text-[var(--primary)]", bg: "bg-[var(--primary)]/10", label: "EXECUTANDO" },
    completed: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/10", label: "CONCLUÍDO" },
    failed: { icon: AlertCircle, color: "text-[var(--destructive)]", bg: "bg-[var(--destructive)]/10", label: "FALHOU" },
    stopped: { icon: Clock, color: "text-amber-400", bg: "bg-amber-400/10", label: "INTERROMPIDO" },
  };

  const filters: { id: AuditFilter; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: entries.length },
    { id: "running", label: "Executando", count: entries.filter((e) => e.status === "running").length },
    { id: "completed", label: "Concluídos", count: entries.filter((e) => e.status === "completed").length },
    { id: "stopped", label: "Interrompidos", count: entries.filter((e) => e.status === "stopped").length },
    { id: "failed", label: "Falhas", count: entries.filter((e) => e.status === "failed").length },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 h-10 border-b border-[var(--border)] bg-[var(--surface-1)]/40 shrink-0">
        <History className="size-3.5 text-[var(--primary)]" />
        <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--foreground)]">
          AUDIT LOG
        </span>

        {/* Filters */}
        <div className="flex items-center gap-1 ml-3">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors ${
                filter === f.id
                  ? "bg-[var(--primary)]/15 text-[var(--primary)]"
                  : "text-[var(--text-ghost)] hover:text-[var(--foreground)]"
              }`}
            >
              {f.label}
              {f.count > 0 && (
                <span className="ml-1 opacity-50">({f.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-1.5 ml-auto px-2 py-1 rounded border border-[var(--border)] bg-[var(--surface-2)]/40">
          <Search className="size-3 text-[var(--text-ghost)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-[120px] bg-transparent text-[10px] font-mono text-[var(--foreground)] placeholder:text-[var(--text-ghost)] outline-none"
          />
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-3 text-[9px] font-mono text-[var(--text-ghost)]">
          <span className="flex items-center gap-1">
            <Layers className="size-3" />
            {totalSteps} steps
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="size-3" />
            ${totalCost.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16">
            <BarChart3 className="size-6 text-[var(--text-ghost)]" />
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-[var(--text-ghost)]">
              NENHUMA EXECUÇÃO
            </span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-1)]/20">
                <th className="text-left px-4 py-2 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                  Projeto
                </th>
                <th className="text-left px-4 py-2 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                  Provider
                </th>
                <th className="text-left px-4 py-2 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                  Status
                </th>
                <th className="text-right px-4 py-2 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                  Steps
                </th>
                <th className="text-right px-4 py-2 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                  Custo
                </th>
                <th className="text-right px-4 py-2 font-mono text-[8px] tracking-[0.2em] uppercase text-[var(--text-ghost)]">
                  Duração
                </th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const status = statusConfig[entry.status];
                const StatusIcon = status.icon;
                const isExpanded = expandedId === entry.id;
                const duration =
                  entry.finishedAt
                    ? (new Date(entry.finishedAt).getTime() - new Date(entry.startedAt).getTime()) / 1000
                    : null;

                return (
                  <>
                  <motion.tr
                    key={entry.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => onSelect?.(entry)}
                    className={`border-b border-[var(--border)]/50 hover:bg-[var(--surface-2)]/30 transition-colors ${
                      selectedId === entry.id ? "bg-[var(--primary)]/8" : ""
                    } ${onSelect ? "cursor-pointer" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-[11px] text-[var(--foreground)]">
                        {entry.projectName}
                      </div>
                      <div className="font-mono text-[8px] text-[var(--text-ghost)] mt-0.5">
                        {new Date(entry.startedAt).toLocaleString("pt-BR")}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="size-1.5 rounded-full bg-[var(--primary)]" />
                        <span className="font-mono text-[10px] text-[var(--text-dim)]">
                          {entry.provider}
                        </span>
                      </div>
                      <div className="font-mono text-[9px] text-[var(--text-ghost)]">
                        {entry.model}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded ${status.color} ${status.bg}`}
                      >
                        <StatusIcon className="size-3" />
                        {status.label}
                      </span>
                      {entry.error && (
                        <div className="font-mono text-[8px] text-[var(--destructive)] mt-1 max-w-[180px] truncate">
                          {entry.error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[10px] text-[var(--text-dim)]">
                      {entry.steps}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[10px] text-[var(--text-dim)]">
                      ${entry.cost.toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[10px] text-[var(--text-ghost)]">
                      {duration !== null ? `${duration.toFixed(1)}s` : "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() =>
                          setExpandedId(isExpanded ? null : entry.id)
                        }
                        className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-ghost)] transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </button>
                    </td>

                  </motion.tr>
                  {isExpanded && (
                    <tr key={`${entry.id}-detail`}>
                      <td colSpan={7} className="px-4 py-3 bg-[var(--surface-1)]/20">
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="space-y-3"
                        >
                          <div>
                            <span className="font-mono text-[8px] tracking-[0.15em] uppercase text-[var(--text-ghost)]">
                              Ferramentas
                            </span>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {entry.toolsUsed.length > 0 ? entry.toolsUsed.map((tool) => (
                                <span
                                  key={tool}
                                  className="flex items-center gap-1 font-mono text-[9px] px-2 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-dim)]"
                                >
                                  <Code2 className="size-3" />
                                  {tool}
                                </span>
                              )) : (
                                <span className="font-mono text-[9px] text-[var(--text-ghost)]">—</span>
                              )}
                            </div>
                          </div>

                          {entry.summary && (
                            <div>
                              <span className="font-mono text-[8px] tracking-[0.15em] uppercase text-[var(--text-ghost)]">
                                Resumo
                              </span>
                              <p className="font-mono text-[10px] text-[var(--text-dim)] mt-1 leading-relaxed max-w-2xl">
                                {entry.summary}
                              </p>
                            </div>
                          )}

                          <a
                            href={`/projects/${entry.projectId}`}
                            className="inline-flex items-center gap-1 font-mono text-[9px] text-[var(--primary)] hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            Abrir projeto
                          </a>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
