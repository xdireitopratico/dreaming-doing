/**
 * AgentListPanel — Left sidebar with agent list, lifecycle badges, and cost
 * Phase 8: Added lifecycle badge (Trial/Published/Draft), cost display
 */
import { memo, useState } from "react";
import { Bot, Search } from "lucide-react";
import { HealthDot } from "./AgentMonitoringDashboard";
import type { AgentHealth } from "./monitoring-types";

interface Props {
  agents: AgentHealth[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  activeCount: number;
  totalCount: number;
}

const LIFECYCLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  trial: { label: "Trial", bg: "rgba(251,191,36,0.12)", color: "var(--ps-orange)" },
  published: { label: "Produção", bg: "rgba(52,211,153,0.12)", color: "var(--ps-green)" },
  draft: { label: "Rascunho", bg: "var(--ps-bg-surface)", color: "var(--ps-cream-25)" },
  archived: { label: "Arquivado", bg: "var(--ps-bg-surface)", color: "var(--ps-cream-25)" },
};

export const AgentListPanel = memo(function AgentListPanel({ agents, selectedId, onSelect, activeCount, totalCount }: Props) {
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(0);

  const filtered = search
    ? agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : agents;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="w-[260px] shrink-0 flex flex-col overflow-hidden" style={{ background: "rgba(0,0,0,0.2)" }}>
      {/* Fleet summary */}
      <div className="px-3 pt-3 pb-2">
        <button
          onClick={() => onSelect(null)}
          className="w-full text-left px-3 py-2 rounded-lg transition-all mb-2"
          style={{
            background: selectedId === null ? "var(--ps-accent-subtle)" : "transparent",
            border: `1px solid ${selectedId === null ? "rgba(59,130,246,0.3)" : "transparent"}`,
          }}
        >
          <div className="text-[11px] font-semibold" style={{ color: selectedId === null ? "var(--ps-accent)" : "var(--ps-cream-60)" }}>
            Visão Geral
          </div>
          <div className="text-[9px] mt-0.5" style={{ color: "var(--ps-cream-25)" }}>
            {activeCount} ativos · {totalCount} total
          </div>
        </button>

        {/* Search */}
        {agents.length > 4 && (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: "var(--ps-cream-25)" }} />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar agente..."
              className="w-full pl-7 pr-2 py-1.5 rounded-lg text-[10px] outline-none"
              style={{
                background: "var(--ps-bg-surface)",
                border: "1px solid var(--ps-border)",
                color: "var(--ps-cream-80)",
              }}
            />
          </div>
        )}
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {paged.map(agent => {
          const isSelected = agent.id === selectedId;
          const badge = LIFECYCLE_BADGE[agent.status] || LIFECYCLE_BADGE.draft;
          return (
            <button
              key={agent.id}
              onClick={() => onSelect(agent.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg transition-all"
              style={{
                background: isSelected ? "var(--ps-accent-subtle)" : "transparent",
                border: `1px solid ${isSelected ? "rgba(59,130,246,0.3)" : "transparent"}`,
              }}
            >
              <div className="flex items-center gap-2">
                <HealthDot health={agent.health} size={8} />
                <span
                  className="text-[11px] font-medium truncate flex-1"
                  style={{ color: isSelected ? "var(--ps-accent)" : "var(--ps-cream-80)" }}
                >
                  {agent.name}
                </span>
                <span
                  className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                  style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.color}30` }}
                >
                  {badge.label}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 ml-4 text-[9px]" style={{ color: "var(--ps-cream-25)" }}>
                <span>{agent.executions} exec</span>
                {agent.executions > 0 && (
                  <span style={{ color: agent.errorRate > 10 ? "var(--ps-red)" : "var(--ps-green)" }}>
                    {(100 - agent.errorRate).toFixed(0)}%
                  </span>
                )}
                {agent.cost > 0 && (
                  <span className="font-mono">${agent.cost.toFixed(3)}</span>
                )}
                {agent.lastExec && <span>{getRelativeTime(agent.lastExec)}</span>}
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center">
            <Bot className="w-6 h-6 mb-2" style={{ color: "var(--ps-cream-15)" }} />
            <span className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
              {search ? "Nenhum agente encontrado" : "Nenhum agente criado"}
            </span>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-3 py-2" style={{ borderTop: "1px solid var(--ps-border)" }}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className="w-5 h-5 rounded text-[9px] font-semibold transition-all"
              style={{
                background: i === page ? "var(--ps-accent-subtle)" : "transparent",
                color: i === page ? "var(--ps-accent)" : "var(--ps-cream-25)",
                border: `1px solid ${i === page ? "rgba(59,130,246,0.3)" : "transparent"}`,
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`;
  return `${Math.floor(diff / 86400_000)}d`;
}
