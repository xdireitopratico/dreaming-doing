/**
 * PrometheusRecentAgents — Recent agents list with search
 * ROADMAP UX: Harmonized delete with AlertDialog, improved hover/empty states
 */
import { useState, useMemo } from "react";
import { Bot, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RecentAgent {
  id: string;
  name: string;
  status: string;
  nodesCount: number;
  lastRun: string;
}

interface Props {
  agents: RecentAgent[];
  onOpen?: (flowId: string) => void;
  onDelete?: (flowId: string) => void;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  published: { bg: "rgba(52,211,153,0.1)", color: "var(--ps-green)" },
  active: { bg: "rgba(52,211,153,0.1)", color: "var(--ps-green)" },
  draft: { bg: "rgba(59,130,246,0.1)", color: "var(--ps-blue)" },
  testing: { bg: "rgba(245,158,11,0.1)", color: "var(--ps-orange)" },
};

const STATUS_LABELS: Record<string, string> = {
  published: "Publicado",
  active: "Ativo",
  draft: "Rascunho",
  testing: "Testando",
};

export function PrometheusRecentAgents({ agents, onOpen, onDelete }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(a => a.name.toLowerCase().includes(q));
  }, [agents, search]);

  if (agents.length === 0) return null;

  return (
    <section className="px-6 pb-12">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="ps-label">Agentes recentes</div>
          {agents.length > 4 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--ps-cream-25)" }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar agente..."
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="pl-8 pr-3 py-1.5 rounded-lg text-[11px] outline-none transition-colors w-44"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid var(--ps-border)",
                  color: "var(--ps-cream-80)",
                }}
              />
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[12px]" style={{ color: "var(--ps-cream-25)" }}>
            Nenhum agente encontrado para "{search}"
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {filtered.map((agent) => {
              const s = STATUS_STYLES[agent.status] || STATUS_STYLES.draft;
              return (
                <div
                  key={agent.id}
                  className="ps-agent-card cursor-pointer hover:border-[var(--ps-accent)] transition-all group relative"
                  onClick={() => onOpen?.(agent.id)}
                >
                  <div className="h-20 flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, hsl(225 30% 10%), hsl(225 30% 16%))" }}>
                    <Bot className="w-8 h-8 transition-transform group-hover:scale-110" style={{ color: "var(--ps-accent-dim)" }} />
                  </div>
                  <div className="p-3">
                    <div className="text-[12px] font-medium mb-0.5 pr-5 line-clamp-1" style={{ color: "var(--ps-cream-80)" }}>
                      {agent.name}
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
                        {agent.nodesCount} nós · {agent.lastRun}
                      </div>
                      <div className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: s.bg, color: s.color }}>
                        {STATUS_LABELS[agent.status] || agent.status}
                      </div>
                    </div>
                  </div>

                  {/* Delete button with AlertDialog */}
                  {onDelete && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10" onClick={e => e.stopPropagation()}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[rgba(224,92,92,0.25)] transition-colors"
                            style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
                            title="Excluir agente"
                          >
                            <Trash2 className="w-3 h-3" style={{ color: "#E05C5C" }} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent
                          className="max-w-[460px] border p-0 overflow-hidden"
                          style={{
                            background: "hsl(225 30% 7%)",
                            borderColor: "var(--ps-border)",
                            boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
                          }}
                        >
                          <AlertDialogHeader className="space-y-3 p-6 text-left">
                            <AlertDialogTitle style={{ color: "var(--ps-cream)" }}>Excluir agente</AlertDialogTitle>
                            <AlertDialogDescription style={{ color: "var(--ps-cream-60)" }}>
                              Excluir "{agent.name}"? Esta ação não pode ser desfeita. Todas as execuções e dados associados serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="border-t p-4" style={{ borderColor: "var(--ps-border)" }}>
                            <AlertDialogCancel
                              className="mt-0 border"
                              style={{ background: "rgba(255,255,255,0.04)", borderColor: "var(--ps-border)", color: "var(--ps-cream-80)" }}
                            >
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="border-0"
                              style={{ background: "var(--ps-red)", color: "hsl(40 30% 96%)" }}
                              onClick={() => onDelete(agent.id)}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
