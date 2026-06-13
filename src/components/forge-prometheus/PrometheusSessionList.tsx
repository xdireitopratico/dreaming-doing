/**
 * PrometheusSessionList — "Meus Agentes" popover for the Editor toolbar
 * Shows all prometheus_build_sessions with collapsible detail cards
 * P3.5: Standalone component, integrated into FlowToolbar
 */
import { useState, useEffect, useCallback } from "react";
import { Bot, ChevronDown, ChevronRight, Clock, Trash2, Play, Layers, Cpu } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

interface SessionItem {
  id: string;
  targetFlowId: string | null;
  outputFlowId: string | null;
  phase: string;
  modelId: string | null;
  objective: string;
  prompt: string;
  nodesCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PrometheusSessionListProps {
  onResumeSession?: (flowId: string) => void;
  onOpenAgent?: (flowId: string) => void;
}

const PHASE_LABELS: Record<string, string> = {
  discovery: "Descoberta",
  clarification: "Clarificação",
  planning: "Planejamento",
  approval: "Aprovação",
  building: "Construção",
  testing: "Testes",
  review: "Revisão",
  deploying: "Deploy",
  complete: "Concluído",
};

const PHASE_COLORS: Record<string, { bg: string; color: string }> = {
  complete: { bg: "rgba(52,211,153,0.1)", color: "var(--ps-green)" },
  building: { bg: "rgba(245,158,11,0.1)", color: "var(--ps-orange)" },
  testing: { bg: "rgba(245,158,11,0.1)", color: "var(--ps-orange)" },
  review: { bg: "rgba(59,130,246,0.1)", color: "var(--ps-blue)" },
  deploying: { bg: "rgba(59,130,246,0.1)", color: "var(--ps-blue)" },
};

export function PrometheusSessionList({ onResumeSession, onOpenAgent }: PrometheusSessionListProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data, error } = await supabase
        .from("prometheus_build_sessions" as any)
        .select("id, phase, target_flow_id, output_flow_id, model_id, requirements, architecture, created_at, updated_at")
        .eq("user_id", userData.user.id)
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error || !data) return;

      const items: SessionItem[] = (data as any[]).map((s) => {
        const req = s.requirements as any;
        const arch = s.architecture as any;
        return {
          id: s.id,
          targetFlowId: s.target_flow_id,
          outputFlowId: s.output_flow_id,
          phase: s.phase || "discovery",
          modelId: s.model_id,
          objective: req?.objective || req?.description || "Agente sem nome",
          prompt: req?.original_prompt || "",
          nodesCount: arch?.nodes?.length || 0,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        };
      });

      setSessions(items);
    } catch (err) {
      console.warn("[SessionList] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  const handleDiscard = useCallback(async (sessionId: string) => {
    try {
      await supabase
        .from("prometheus_build_sessions" as any)
        .update({ phase: "complete" } as any)
        .eq("id", sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.warn("[SessionList] discard error:", err);
    }
  }, []);

  const handleAction = useCallback((session: SessionItem) => {
    setOpen(false);
    if (session.phase === "complete" && session.outputFlowId) {
      onOpenAgent?.(session.outputFlowId);
    } else if (session.targetFlowId) {
      onResumeSession?.(session.targetFlowId);
    }
  }, [onResumeSession, onOpenAgent]);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " · " +
        d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 relative"
          title="Meus Agentes"
          style={{ color: open ? "var(--ps-accent)" : "var(--ps-cream-60)" }}
        >
          <Bot className="h-3.5 w-3.5" />
          {sessions.some((s) => s.phase !== "complete") && (
            <span
              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
              style={{ background: "var(--ps-accent)" }}
            />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0"
        style={{
          background: "var(--ps-bg)",
          borderColor: "var(--ps-border)",
          boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div className="px-3 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--ps-border)" }}>
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" style={{ color: "var(--ps-accent)" }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--ps-cream-80)" }}>
              Meus Agentes
            </span>
          </div>
          <span className="text-[10px]" style={{ color: "var(--ps-cream-25)" }}>
            {sessions.length} sessões
          </span>
        </div>

        {/* List */}
        <ScrollArea className="max-h-[380px]">
          {loading ? (
            <div className="py-8 text-center text-[11px]" style={{ color: "var(--ps-cream-25)" }}>
              Carregando...
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-[11px]" style={{ color: "var(--ps-cream-25)" }}>
              Nenhum agente encontrado
            </div>
          ) : (
            <div className="py-1">
              {sessions.map((session) => {
                const isExpanded = expandedId === session.id;
                const isActive = session.phase !== "complete";
                const phaseStyle = PHASE_COLORS[session.phase] || { bg: "rgba(59,130,246,0.06)", color: "var(--ps-cream-40)" };

                return (
                  <div key={session.id} className="px-2 py-0.5">
                    <div
                      className="rounded-lg p-2.5 cursor-pointer transition-all hover:border-[var(--ps-accent)]"
                      style={{
                        background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent",
                        border: `1px solid ${isExpanded ? "var(--ps-border-hover)" : "transparent"}`,
                      }}
                      onClick={() => setExpandedId(isExpanded ? null : session.id)}
                    >
                      {/* Card header */}
                      <div className="flex items-start gap-2">
                        <div className="shrink-0 mt-0.5">
                          {isExpanded
                            ? <ChevronDown className="h-3 w-3" style={{ color: "var(--ps-cream-40)" }} />
                            : <ChevronRight className="h-3 w-3" style={{ color: "var(--ps-cream-25)" }} />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium line-clamp-1" style={{ color: "var(--ps-cream-80)" }}>
                            {session.objective}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider"
                              style={{ background: phaseStyle.bg, color: phaseStyle.color }}
                            >
                              {PHASE_LABELS[session.phase] || session.phase}
                            </span>
                            <span className="text-[9px] flex items-center gap-0.5" style={{ color: "var(--ps-cream-25)" }}>
                              <Clock className="h-2.5 w-2.5" />
                              {formatDate(session.updatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-3 ml-5 space-y-2">
                          {/* Prompt */}
                          {session.prompt && (
                            <div className="text-[10px] p-2 rounded" style={{ background: "rgba(255,255,255,0.02)", color: "var(--ps-cream-60)", border: "1px solid var(--ps-border)" }}>
                              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--ps-cream-25)" }}>Prompt inicial</div>
                              <div className="line-clamp-3">{session.prompt}</div>
                            </div>
                          )}

                          {/* Meta */}
                          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--ps-cream-40)" }}>
                            {session.nodesCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Layers className="h-2.5 w-2.5" />
                                {session.nodesCount} nós
                              </span>
                            )}
                            {session.modelId && (
                              <span className="flex items-center gap-1">
                                <Cpu className="h-2.5 w-2.5" />
                                {session.modelId.split("/").pop()}
                              </span>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] gap-1 px-2"
                              style={{ color: "var(--ps-accent)" }}
                              onClick={(e) => { e.stopPropagation(); handleAction(session); }}
                            >
                              <Play className="h-2.5 w-2.5" />
                              {isActive ? "Retomar" : "Abrir"}
                            </Button>

                            {isActive && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] gap-1 px-2"
                                      style={{ color: "var(--ps-red)" }}
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                      Descartar
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent
                                    className="max-w-[420px] border p-0 overflow-hidden"
                                    style={{
                                      background: "hsl(225 30% 7%)",
                                      borderColor: "var(--ps-border)",
                                      boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
                                    }}
                                  >
                                    <AlertDialogHeader className="space-y-3 p-6 text-left">
                                      <AlertDialogTitle style={{ color: "var(--ps-cream)" }}>Descartar sessão</AlertDialogTitle>
                                      <AlertDialogDescription style={{ color: "var(--ps-cream-60)" }}>
                                        Descartar a sessão "{session.objective}"? O progresso será perdido.
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
                                        onClick={() => handleDiscard(session.id)}
                                      >
                                        Descartar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
