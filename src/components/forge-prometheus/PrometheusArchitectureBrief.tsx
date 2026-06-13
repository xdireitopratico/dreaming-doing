/**
 * PrometheusArchitectureBrief — Equivalent to VideoCreativeBrief
 * Presents the boardroom output: agent architecture, prompts, and cost estimate
 * User can approve, adjust (go back to boardroom), or edit inline.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { PrometheusParticles } from "./PrometheusParticles";
import { estimateAgentCost } from "./prometheusCatalog";
import "./prometheus-studio.css";

interface BriefData {
  objective?: string;
  audience?: string;
  tone?: string;
  genome?: string;
  nodes?: Array<{ id: string; type: string; label: string }>;
  edges?: Array<{ source: string; target: string }>;
  prompts?: Array<{ nodeId: string; preview: string }>;
  costEstimate?: number;
  tools?: string[];
  channels?: string[];
  autoHealing?: boolean;
}

interface Props {
  flowId: string;
  qualityModel: string;
  onApprove: (editedBrief?: BriefData) => void;
  onRefine: () => void;
  onReject?: () => void;
  onBack?: () => void;
}

export function PrometheusArchitectureBrief({ flowId, qualityModel, onApprove, onRefine, onReject, onBack }: Props) {
  const [brief, setBrief] = useState<BriefData>({});
  const [loading, setLoading] = useState(true);
  const [editingObjective, setEditingObjective] = useState(false);

  useEffect(() => {
    const loadBrief = async () => {
      try {
        const { data: flowData } = await supabase
          .from("agent_flows")
          .select("flow_definition, name, description")
          .eq("id", flowId)
          .single();

        if (!flowData) return;

        const flowDef = (flowData.flow_definition as any) || {};
        const briefing = flowDef.briefing || {};
        let boardroomOutput = flowDef.boardroom_output || {};

        const { data: sessions } = await supabase
          .from("prometheus_build_sessions" as any)
          .select("architecture, requirements")
          .eq("target_flow_id", flowId)
          .not("phase", "eq", "complete")
          .order("created_at", { ascending: false })
          .limit(1);

        const sessionArch = (sessions?.[0] as any)?.architecture;
        const sessionReqs = (sessions?.[0] as any)?.requirements;
        if (sessionArch && !boardroomOutput.genome) {
          boardroomOutput = {
            genome: sessionArch.genome_name,
            objective: sessionReqs?.objective || briefing.prompt,
            audience: sessionReqs?.target_audience,
            tone: sessionReqs?.tone,
            nodes: sessionArch.nodes,
            edges: sessionArch.edges,
            costEstimate: sessionArch.estimated_cost_per_interaction,
            tools: sessionReqs?.tools_needed || [],
          };
        }

        const parsed: BriefData = {
          objective: boardroomOutput.objective || briefing.prompt || flowData.description || "",
          audience: boardroomOutput.audience || briefing.audience || "",
          tone: boardroomOutput.tone || briefing.personality || "",
          genome: boardroomOutput.genome || briefing.architecture_type || "Personalizado",
          nodes: flowDef.nodes?.length > 0
            ? flowDef.nodes.map((n: any) => ({ id: n.id, type: n.type || "llm", label: n.data?.label || n.id }))
            : [
                { id: "trigger_1", type: "trigger", label: "Trigger" },
                { id: "llm_1", type: "llm", label: "LLM Principal" },
                { id: "guard_1", type: "output_guard", label: "Output Guard" },
              ],
          edges: flowDef.edges?.length > 0
            ? flowDef.edges.map((e: any) => ({ source: e.source, target: e.target }))
            : [
                { source: "trigger_1", target: "llm_1" },
                { source: "llm_1", target: "guard_1" },
              ],
          prompts: boardroomOutput.prompts || [
            { nodeId: "LLM Principal", preview: "System prompt será gerado pelo Prometheus..." },
          ],
          costEstimate: estimateAgentCost(qualityModel),
          tools: boardroomOutput.tools || briefing.integrations || [],
          channels: briefing.channels || [],
          autoHealing: briefing.auto_healing ?? true,
        };

        setBrief(parsed);
      } catch (err) {
        console.warn("[architecture-brief] Failed to load:", err);
      } finally {
        setLoading(false);
      }
    };

    loadBrief();
  }, [flowId, qualityModel]);

  if (loading) {
    return (
      <div className="prometheus-studio relative overflow-hidden flex items-center justify-center" style={{ minHeight: "100%" }}>
        <PrometheusParticles />
        <div className="relative z-10 text-center">
          <div className="w-10 h-10 rounded-full mx-auto mb-3 animate-spin"
            style={{ border: "2px solid rgba(59,130,246,0.2)", borderTopColor: "var(--ps-accent)" }} />
          <div className="text-[12px]" style={{ color: "var(--ps-cream-40)" }}>Preparando Plano Arquitetural...</div>
        </div>
      </div>
    );
  }

  const NODE_TYPE_ICONS: Record<string, string> = {
    trigger: "⚡",
    llm: "🧠",
    condition: "🔀",
    tool: "🔧",
    output_guard: "🛡️",
    rag: "📚",
    human: "👤",
    audio: "🎤",
    vision: "👁️",
  };

  return (
    <div className="prometheus-studio relative overflow-hidden" style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PrometheusParticles />

      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--ps-border)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={onBack || onRefine}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--ps-cream-80)", border: "1px solid var(--ps-border)" }}>
              ← Voltar
            </button>
            <div className="h-5 w-px" style={{ background: "var(--ps-border)" }} />
            <div className="flex gap-1.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ps-accent-dim)" }} />
              ))}
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ps-accent)", boxShadow: "0 0 8px var(--ps-accent-glow)" }} />
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ps-border)" }} />
            </div>
            <span className="text-xs sm:text-sm tracking-[0.18em] uppercase" style={{ color: "var(--ps-accent-dim)" }}>
              Plano Arquitetural
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {onReject && (
              <button onClick={onReject}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--ps-cream-60)", border: "1px solid var(--ps-border)" }}>
                Rejeitar
              </button>
            )}
            <button onClick={onRefine}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--ps-cream-80)", border: "1px solid var(--ps-border)" }}>
              ✏️ Ajustar
            </button>
            <button onClick={() => onApprove(brief)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--ps-accent)", color: "#000" }}>
              Aprovar →
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-[800px] mx-auto w-full">

          {/* Objective */}
          {brief.objective && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl p-5"
              style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}
            >
              <div className="text-[9px] tracking-[2px] uppercase mb-2" style={{ color: "var(--ps-accent)" }}>
                Objetivo do Agente
              </div>
              {editingObjective ? (
                <textarea
                  autoFocus
                  className="w-full text-[14px] leading-relaxed bg-transparent border rounded p-2 outline-none resize-none"
                  style={{ color: "var(--ps-cream)", borderColor: "var(--ps-accent-glow)" }}
                  rows={3}
                  value={brief.objective}
                  onChange={(e) => setBrief(prev => ({ ...prev, objective: e.target.value }))}
                  onBlur={() => setEditingObjective(false)}
                />
              ) : (
                <div
                  className="text-[14px] leading-relaxed cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ color: "var(--ps-cream)" }}
                  onClick={() => setEditingObjective(true)}
                  title="Clique para editar"
                >
                  {brief.objective}
                </div>
              )}
            </motion.div>
          )}

          {/* Agent Profile — side by side */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {brief.audience && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
              >
                <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{ color: "var(--ps-cream-25)" }}>
                  Público-alvo
                </div>
                <div className="text-[12px]" style={{ color: "var(--ps-cream-60)" }}>{brief.audience}</div>
              </motion.div>
            )}
            {brief.tone && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
              >
                <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{ color: "var(--ps-cream-25)" }}>
                  Tom
                </div>
                <div className="text-[12px]" style={{ color: "var(--ps-cream-60)" }}>{brief.tone}</div>
              </motion.div>
            )}
            {brief.genome && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
              >
                <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{ color: "var(--ps-cream-25)" }}>
                  Genome
                </div>
                <div className="text-[12px] font-medium" style={{ color: "var(--ps-accent)" }}>{brief.genome}</div>
              </motion.div>
            )}
          </div>

          {/* Node Plan */}
          {brief.nodes && brief.nodes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl p-5"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
            >
              <div className="text-[9px] tracking-[2px] uppercase mb-3" style={{ color: "var(--ps-accent)" }}>
                Plano de Nós ({brief.nodes.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {brief.nodes.map((node, i) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: "rgba(59,130,246,0.06)",
                      border: "1px solid rgba(59,130,246,0.15)",
                    }}
                  >
                    <span className="text-[14px]">{NODE_TYPE_ICONS[node.type] || "📦"}</span>
                    <div>
                      <div className="text-[11px] font-medium" style={{ color: "var(--ps-cream)" }}>
                        {node.label}
                      </div>
                      <div className="text-[9px]" style={{ color: "var(--ps-cream-25)" }}>
                        {node.type}
                      </div>
                    </div>
                    {i < (brief.nodes?.length ?? 0) - 1 && (
                      <span className="text-[10px] ml-1" style={{ color: "var(--ps-cream-15)" }}>→</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Prompts */}
          {brief.prompts && brief.prompts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-xl p-5"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
            >
              <div className="text-[9px] tracking-[2px] uppercase mb-3" style={{ color: "var(--ps-purple)" }}>
                ✍️ Prompts Propostos
              </div>
              <div className="space-y-2">
                {brief.prompts.map((p, i) => (
                  <div key={i} className="px-3 py-2 rounded-lg text-[11px]"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)", color: "var(--ps-cream-60)" }}>
                    <span className="font-medium" style={{ color: "var(--ps-accent)" }}>{p.nodeId}</span>
                    <span className="mx-1.5" style={{ color: "var(--ps-cream-25)" }}>·</span>
                    {p.preview}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Cost + Config summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-xl p-4"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
            >
              <div className="text-[9px] tracking-[2px] uppercase mb-2" style={{ color: "var(--ps-green)" }}>
                Custo Estimado
              </div>
              <div className="text-[18px] font-bold ps-mono" style={{ color: "var(--ps-green)" }}>
                ~${brief.costEstimate?.toFixed(3) || "0.003"}/interação
              </div>
              <div className="text-[10px] mt-1" style={{ color: "var(--ps-cream-25)" }}>
                Modelo: {qualityModel}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-xl p-4"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ps-border)" }}
            >
              <div className="text-[9px] tracking-[2px] uppercase mb-2" style={{ color: "var(--ps-cream-25)" }}>
                Configuração
              </div>
              <div className="space-y-1">
                {brief.channels && brief.channels.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {brief.channels.map(c => (
                      <span key={c} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(59,130,246,0.1)", color: "var(--ps-accent)", border: "1px solid rgba(59,130,246,0.2)" }}>
                        📡 {c}
                      </span>
                    ))}
                  </div>
                )}
                {brief.tools && brief.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {brief.tools.map(t => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(255,255,255,0.04)", color: "var(--ps-cream-40)", border: "1px solid var(--ps-border)" }}>
                        🔌 {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-[10px] mt-1" style={{ color: brief.autoHealing ? "var(--ps-accent)" : "var(--ps-cream-40)" }}>
                  Auto-Healing: {brief.autoHealing ? "✅ Ativado" : "❌ Desativado"}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
