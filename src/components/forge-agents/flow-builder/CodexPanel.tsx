/**
 * CodexPanel — Genome Library & Empirical Learning Dashboard
 * Phase 7: Shows genome performance metrics, trends, and optimization insights
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X, Dna, TrendingUp, TrendingDown, Minus, BarChart3,
  Brain, RefreshCw, Loader2, CheckCircle2,
  AlertTriangle, Clock, Zap,
} from "lucide-react";

interface CodexPanelProps {
  flowId: string;
  onClose: () => void;
}

interface GenomeInsight {
  genome_id: string;
  genome_key: string;
  genome_name: string;
  domain: string;
  total_builds: number;
  success_rate: number;
  avg_quality: number;
  avg_pass_rate: number;
  avg_build_time_s: number;
  avg_iterations: number;
  top_models: string[];
  trend: "improving" | "stable" | "declining";
}

interface CodexReport {
  total_genomes: number;
  total_builds: number;
  insights: GenomeInsight[];
  recommendations: string[];
  generated_at: string;
}

export function CodexPanel({ flowId, onClose }: CodexPanelProps) {
  const [report, setReport] = useState<CodexReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [expandedGenome, setExpandedGenome] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("prometheus-builder", {
        body: { action: "codex_report" },
      });
      if (error) throw error;
      setReport(data);
    } catch (err) {
      console.error("[CodexPanel] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const fetchAiInsights = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("prometheus-builder", {
        body: { action: "codex_insights" },
      });
      if (error) throw error;
      setAiInsights(data?.suggestions || "Sem insights disponíveis.");
    } catch {
      setAiInsights("Erro ao gerar insights.");
    } finally {
      setAiLoading(false);
    }
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === "improving") return <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--ps-green)" }} />;
    if (trend === "declining") return <TrendingDown className="h-3.5 w-3.5" style={{ color: "var(--ps-red, #ef4444)" }} />;
    return <Minus className="h-3.5 w-3.5" style={{ color: "var(--ps-cream-40)" }} />;
  };

  const QualityBar = ({ value }: { value: number }) => (
    <div className="w-full h-1.5 rounded-full" style={{ background: "var(--ps-bg-surface)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(value * 100, 100)}%`,
          background: value >= 0.7 ? "var(--ps-green)" : value >= 0.5 ? "var(--ps-orange)" : "var(--ps-red, #ef4444)",
        }}
      />
    </div>
  );

  return (
    <div className="w-[400px] flex flex-col shrink-0 h-full" style={{ background: "var(--ps-bg)", borderLeft: "1px solid var(--ps-border)" }}>
      {/* Header */}
      <div className="p-3 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid var(--ps-border)" }}>
        <div className="flex items-center gap-2">
          <Dna className="h-4 w-4" style={{ color: "var(--ps-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--ps-cream)" }}>Codex — Biblioteca Genômica</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchReport} title="Atualizar">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} style={{ color: "var(--ps-cream-40)" }} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" style={{ color: "var(--ps-cream-40)" }} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {loading && !report ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ps-accent)" }} />
            </div>
          ) : !report ? (
            <p className="text-xs text-center py-8" style={{ color: "var(--ps-cream-40)" }}>Erro ao carregar dados do Codex.</p>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Genomes", value: report.total_genomes, icon: Dna },
                  { label: "Builds", value: report.total_builds, icon: Zap },
                  { label: "Ativos", value: report.insights.filter(i => i.total_builds > 0).length, icon: CheckCircle2 },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-lg p-2 text-center" style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}>
                    <Icon className="h-3.5 w-3.5 mx-auto mb-1" style={{ color: "var(--ps-accent)" }} />
                    <div className="text-lg font-bold" style={{ color: "var(--ps-cream)" }}>{value}</div>
                    <div className="text-[10px]" style={{ color: "var(--ps-cream-40)" }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <div className="rounded-lg p-2.5 space-y-1" style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--ps-cream-40)" }}>Recomendações</div>
                  {report.recommendations.map((r, i) => (
                    <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--ps-cream-80)" }}>{r}</p>
                  ))}
                </div>
              )}

              {/* AI Insights */}
              <div className="rounded-lg p-2.5" style={{ background: "var(--ps-bg-surface)", border: "1px solid var(--ps-border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Brain className="h-3.5 w-3.5" style={{ color: "var(--ps-accent)" }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ps-cream-40)" }}>Insights IA</span>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2"
                    onClick={fetchAiInsights} disabled={aiLoading}
                    style={{ color: "var(--ps-accent)" }}
                  >
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                    Gerar
                  </Button>
                </div>
                {aiInsights ? (
                  <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--ps-cream-80)" }}>{aiInsights}</p>
                ) : (
                  <p className="text-[10px] italic" style={{ color: "var(--ps-cream-40)" }}>Clique em "Gerar" para análise via IA dos dados empíricos.</p>
                )}
              </div>

              {/* Genome List */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--ps-cream-40)" }}>
                  Genomes ({report.insights.length})
                </div>
                <div className="space-y-1.5">
                  {report.insights.map((g) => (
                    <div
                      key={g.genome_id}
                      className="rounded-lg p-2.5 cursor-pointer transition-colors"
                      style={{
                        background: expandedGenome === g.genome_id ? "var(--ps-accent-subtle)" : "var(--ps-bg-surface)",
                        border: `1px solid ${expandedGenome === g.genome_id ? "var(--ps-border-accent-dim)" : "var(--ps-border)"}`,
                      }}
                      onClick={() => setExpandedGenome(expandedGenome === g.genome_id ? null : g.genome_id)}
                    >
                      {/* Row header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Dna className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--ps-accent)" }} />
                          <span className="text-xs font-medium truncate" style={{ color: "var(--ps-cream)" }}>{g.genome_name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <TrendIcon trend={g.trend} />
                          <Badge variant="secondary" className="text-[9px] px-1 h-4" style={{ background: "var(--ps-bg)", color: "var(--ps-cream-60)" }}>
                            {g.total_builds} builds
                          </Badge>
                        </div>
                      </div>

                      {/* Quality bar */}
                      {g.total_builds > 0 && (
                        <div className="mt-1.5">
                          <QualityBar value={g.avg_quality} />
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[9px]" style={{ color: "var(--ps-cream-40)" }}>Qualidade: {(g.avg_quality * 100).toFixed(0)}%</span>
                            <span className="text-[9px]" style={{ color: "var(--ps-cream-40)" }}>Sucesso: {g.success_rate}%</span>
                          </div>
                        </div>
                      )}

                      {/* Expanded details */}
                      {expandedGenome === g.genome_id && (
                        <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: "1px solid var(--ps-border)" }}>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[9px]" style={{ color: "var(--ps-cream-40)" }}>Domínio</div>
                              <div className="text-xs" style={{ color: "var(--ps-cream)" }}>{g.domain}</div>
                            </div>
                            <div>
                              <div className="text-[9px]" style={{ color: "var(--ps-cream-40)" }}>Pass Rate</div>
                              <div className="text-xs" style={{ color: "var(--ps-cream)" }}>{(g.avg_pass_rate * 100).toFixed(0)}%</div>
                            </div>
                            <div>
                              <div className="text-[9px]" style={{ color: "var(--ps-cream-40)" }}>Tempo Médio</div>
                              <div className="text-xs flex items-center gap-1" style={{ color: "var(--ps-cream)" }}>
                                <Clock className="h-3 w-3" /> {g.avg_build_time_s}s
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px]" style={{ color: "var(--ps-cream-40)" }}>Iterações</div>
                              <div className="text-xs" style={{ color: "var(--ps-cream)" }}>{g.avg_iterations}</div>
                            </div>
                          </div>
                          {g.top_models.length > 0 && (
                            <div>
                              <div className="text-[9px] mb-1" style={{ color: "var(--ps-cream-40)" }}>Modelos mais usados</div>
                              <div className="flex flex-wrap gap-1">
                                {g.top_models.map((m) => (
                                  <Badge key={m} variant="outline" className="text-[9px] px-1.5 h-4" style={{ borderColor: "var(--ps-border)", color: "var(--ps-cream-60)" }}>
                                    {m.split("/").pop()}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {g.trend !== "stable" && (
                            <div className="flex items-center gap-1 mt-1">
                              {g.trend === "improving" ? (
                                <><TrendingUp className="h-3 w-3" style={{ color: "var(--ps-green)" }} /><span className="text-[10px]" style={{ color: "var(--ps-green)" }}>Tendência positiva</span></>
                              ) : (
                                <><TrendingDown className="h-3 w-3" style={{ color: "var(--ps-red, #ef4444)" }} /><span className="text-[10px]" style={{ color: "var(--ps-red, #ef4444)" }}>Tendência de queda</span></>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
