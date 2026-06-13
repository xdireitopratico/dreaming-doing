/**
 * PrometheusReview — Agent presentation after build
 * Mirrors VideoStoryboard + VideoDelivery pattern
 * WITH: Inline prompt editing, celebration, rating feedback
 * Step 15: Business Plan sections (executive summary, research, integrations, alternatives)
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Star, ChevronDown, ChevronUp, ExternalLink, Lock, Lightbulb, FileText, Search, Puzzle, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { PrometheusParticles } from "./PrometheusParticles";
import { PrometheusFlowPreview } from "./PrometheusFlowPreview";
import { PrometheusTestResults } from "./PrometheusTestResults";
import { PrometheusCostSummary } from "./PrometheusCostSummary";
import { PrometheusReviewPrompts } from "./PrometheusReviewPrompts";
import { PrometheusTrialPlayground } from "./PrometheusTrialPlayground";
import { useCelebration } from "@/hooks/useCelebration";
import "./prometheus-studio.css";

export interface AgentReportData {
  executive_summary?: string;
  research_summary?: string;
  architecture_explanation?: { node_id: string; label: string; explanation: string }[];
  integrations?: { name: string; url?: string; status: "configured" | "needs_auth" | "suggested"; description: string }[];
  test_summary?: { pass_rate: number; tests_run: number; highlights: string[] };
  cost_estimate?: { per_execution_cents: number; model_name: string; breakdown: string };
  alternatives?: string[];
  tokens_consumed?: number;
  build_time_seconds?: number;
}

export interface ReviewData {
  agentName: string;
  genome: string;
  nodes: { id: string; type: string; label: string }[];
  edges: { source: string; target: string }[];
  prompts: { nodeId: string; preview: string }[];
  testResults: { name: string; passed: boolean; detail?: string }[];
  passRate: number;
  qualityScore: number;
  costPerInteraction: number;
  channels: string[];
  report?: AgentReportData;
}

interface Props {
  data: ReviewData;
  flowId?: string;
  onOpenBuilder: () => void;
  onAdjust: () => void;
  onDeploy?: () => void | Promise<void>;
  onBack: () => void;
}

export function PrometheusReview({ data, flowId, onOpenBuilder, onAdjust, onDeploy, onBack }: Props) {
  const passRatePct = data.passRate > 1 ? data.passRate : data.passRate * 100;
  const canDeploy = passRatePct >= 80;
  const [showCelebration, setShowCelebration] = useState(true);
  const [showPlayground, setShowPlayground] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [showArchDetails, setShowArchDetails] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const { celebrate, trackAchievement } = useCelebration();

  // Celebration on mount
  useEffect(() => {
    celebrate("confetti_full");
    const isFirst = trackAchievement("first_agent");
    if (isFirst) {
      toast.success("🏆 Conquista: Primeiro Agente!", { duration: 5000 });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowCelebration(false), 3000);
    return () => clearTimeout(timer);
  }, []);


  const handleRating = useCallback((n: number) => {
    setFeedbackRating(n);
    setFeedbackSent(true);
    toast.success("Obrigado pelo feedback!");
  }, []);

  return (
    <div className="prometheus-studio relative overflow-hidden overflow-y-auto" style={{ minHeight: "100%" }}>
      <PrometheusParticles />

      {/* Celebration overlay */}
      {showCelebration && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 2, duration: 1 }}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="text-center"
          >
            <div className="text-[48px] mb-3">🤖</div>
            <h2 className="text-[24px] font-bold" style={{ color: "var(--ps-accent)" }}>
              Seu agente está pronto!
            </h2>
          </motion.div>
          {Array.from({ length: 20 }, (_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{ background: i % 2 === 0 ? "var(--ps-accent)" : "var(--ps-green)" }}
              initial={{ x: 0, y: 0, scale: 0 }}
              animate={{
                x: (Math.random() - 0.5) * 600,
                y: (Math.random() - 0.5) * 400,
                scale: [0, 1, 0],
                opacity: [0, 1, 0],
              }}
              transition={{ duration: 2, delay: 0.2 + i * 0.05, ease: "easeOut" }}
            />
          ))}
        </motion.div>
      )}

      <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 py-6" style={{ minHeight: "100%" }}>

        {/* Header */}
        <div className="w-full max-w-[800px] flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={onBack}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--ps-cream-80)", border: "1px solid var(--ps-border)" }}>
              ← Voltar
            </button>
            <div className="h-5 w-px" style={{ background: "var(--ps-border)" }} />
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ps-accent-dim)" }} />
              ))}
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--ps-accent)", boxShadow: "0 0 8px var(--ps-accent-glow)" }} />
            </div>
          </div>
          <span className="text-xs sm:text-sm tracking-[0.18em] uppercase" style={{ color: "var(--ps-accent-dim)" }}>
            Revisão do Agente
          </span>
        </div>

        {/* Agent name + badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[800px] text-center mb-6"
        >
          <h1 className="text-xl sm:text-2xl font-bold mb-2" style={{ color: "var(--ps-cream)" }}>
            🤖 {data.agentName}
          </h1>
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: "rgba(59,130,246,0.1)", color: "var(--ps-accent)", border: "1px solid rgba(59,130,246,0.2)" }}>
              Genome: {data.genome}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md" style={{
              background: passRatePct >= 90 ? "rgba(52,211,153,0.1)" : "rgba(245,158,11,0.1)",
              color: passRatePct >= 90 ? "hsl(142 70% 45%)" : "hsl(45 100% 50%)",
              border: `1px solid ${passRatePct >= 90 ? "rgba(52,211,153,0.2)" : "rgba(245,158,11,0.2)"}`,
            }}>
              Quality: {data.qualityScore > 1 ? data.qualityScore.toFixed(1) : (data.qualityScore * 10).toFixed(1)}/10
            </span>
          </div>
        </motion.div>

        {/* Flow Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-[800px] mb-4"
        >
          <PrometheusFlowPreview nodes={data.nodes} edges={data.edges} />
        </motion.div>

        {/* ═══ BUSINESS PLAN SECTIONS (Step 15) ═══ */}
        {data.report && (
          <>
            {/* Executive Summary */}
            {data.report.executive_summary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="w-full max-w-[800px] mb-4 rounded-xl p-4"
                style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4" style={{ color: "var(--ps-accent)" }} />
                  <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--ps-accent)" }}>
                    Resumo Executivo
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--ps-cream-80)" }}>
                  {data.report.executive_summary}
                </p>
              </motion.div>
            )}

            {/* Research Summary */}
            {data.report.research_summary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="w-full max-w-[800px] mb-4 rounded-xl p-4"
                style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4" style={{ color: "hsl(270 70% 60%)" }} />
                  <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "hsl(270 70% 60%)" }}>
                    Pesquisa Realizada
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--ps-cream-80)" }}>
                  {data.report.research_summary}
                </p>
              </motion.div>
            )}

            {/* Architecture Explanation */}
            {data.report.architecture_explanation && data.report.architecture_explanation.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="w-full max-w-[800px] mb-4 rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}
              >
                <button
                  onClick={() => setShowArchDetails(!showArchDetails)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <Puzzle className="w-4 h-4" style={{ color: "var(--ps-cream-60)" }} />
                  <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--ps-cream-60)" }}>
                    Explicação por Nó ({data.report.architecture_explanation.length})
                  </span>
                  {showArchDetails
                    ? <ChevronUp className="w-3.5 h-3.5 ml-auto" style={{ color: "var(--ps-cream-40)" }} />
                    : <ChevronDown className="w-3.5 h-3.5 ml-auto" style={{ color: "var(--ps-cream-40)" }} />}
                </button>
                {showArchDetails && (
                  <div className="mt-3 space-y-2">
                    {data.report.architecture_explanation.map((node) => (
                      <div key={node.node_id} className="p-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <div className="text-[11px] font-semibold mb-1" style={{ color: "var(--ps-accent)" }}>
                          {node.label} <span style={{ color: "var(--ps-cream-25)" }}>({node.node_id})</span>
                        </div>
                        <div className="text-[12px]" style={{ color: "var(--ps-cream-60)" }}>{node.explanation}</div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Integrations */}
            {data.report.integrations && data.report.integrations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
                className="w-full max-w-[800px] mb-4 rounded-xl p-4"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ps-border)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <ExternalLink className="w-4 h-4" style={{ color: "var(--ps-cream-60)" }} />
                  <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "var(--ps-cream-60)" }}>
                    Integrações
                  </span>
                </div>
                <div className="space-y-2">
                  {data.report.integrations.map((intg, i) => (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      <span>
                        {intg.status === "configured" ? "✅" : intg.status === "needs_auth" ? "🔑" : "💡"}
                      </span>
                      <span className="font-medium" style={{ color: "var(--ps-cream-80)" }}>{intg.name}</span>
                      <span style={{ color: "var(--ps-cream-40)" }}>— {intg.description}</span>
                      {intg.status === "needs_auth" && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(245,158,11,0.1)", color: "hsl(38 92% 50%)" }}>
                          <Lock className="w-3 h-3" /> Precisa configurar
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Alternatives */}
            {data.report.alternatives && data.report.alternatives.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full max-w-[800px] mb-4 rounded-xl p-4"
                style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.12)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4" style={{ color: "hsl(142 70% 45%)" }} />
                  <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: "hsl(142 70% 45%)" }}>
                    Sugestões de Melhoria
                  </span>
                </div>
                <ul className="space-y-1">
                  {data.report.alternatives.map((alt, i) => (
                    <li key={i} className="text-[12px] flex items-start gap-2" style={{ color: "var(--ps-cream-60)" }}>
                      <span style={{ color: "hsl(142 70% 45%)" }}>•</span> {alt}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Build Metrics */}
            {(data.report.tokens_consumed || data.report.build_time_seconds) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 }}
                className="w-full max-w-[800px] mb-4 flex gap-3 justify-center"
              >
                {data.report.tokens_consumed != null && data.report.tokens_consumed > 0 && (
                  <span className="text-[10px] px-2.5 py-1 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.04)", color: "var(--ps-cream-40)", border: "1px solid var(--ps-border)" }}>
                    <FlaskConical className="w-3 h-3 inline mr-1" />
                    {data.report.tokens_consumed.toLocaleString()} tokens consumidos
                  </span>
                )}
                {data.report.build_time_seconds != null && data.report.build_time_seconds > 0 && (
                  <span className="text-[10px] px-2.5 py-1 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.04)", color: "var(--ps-cream-40)", border: "1px solid var(--ps-border)" }}>
                    ⏱️ {Math.floor(data.report.build_time_seconds / 60)}m{data.report.build_time_seconds % 60}s de build
                  </span>
                )}
              </motion.div>
            )}
          </>
        )}

        {/* Prompts — extracted component with inline editing */}
        <PrometheusReviewPrompts prompts={data.prompts} />

        {/* Test Results + Cost */}
        <div className="w-full max-w-[800px] grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <PrometheusTestResults tests={data.testResults} passRate={data.passRate} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <PrometheusCostSummary
              costPerInteraction={data.costPerInteraction}
              nodesCount={data.nodes.length}
              channels={data.channels}
              qualityScore={data.qualityScore}
            />
          </motion.div>
        </div>

        {/* Trial Playground */}
        {showPlayground && flowId && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[800px] mb-6 h-[400px]"
          >
            <PrometheusTrialPlayground flowId={flowId} agentName={data.agentName} />
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-[800px] flex items-center justify-center gap-3"
        >
          <button
            onClick={onAdjust}
            className="px-5 py-2.5 rounded-lg text-[12px] font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.06)", color: "var(--ps-cream-60)", border: "1px solid var(--ps-border)" }}
          >
            ✏️ Ajustar
          </button>
          {flowId && (
            <button
              onClick={() => setShowPlayground(!showPlayground)}
              className="px-5 py-2.5 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: showPlayground ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.1)",
                color: "hsl(38 92% 50%)",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              🧪 {showPlayground ? "Fechar Playground" : "Testar Agente"}
            </button>
          )}
          <button
            onClick={onOpenBuilder}
            className="px-5 py-2.5 rounded-lg text-[12px] font-semibold transition-all"
            style={{ background: "rgba(59,130,246,0.15)", color: "var(--ps-accent)", border: "1px solid rgba(59,130,246,0.3)" }}
          >
            🔧 Abrir no Builder
          </button>
          {onDeploy && (
            <button
              onClick={async () => {
                setIsDeploying(true);
                try { await onDeploy(); } finally { setIsDeploying(false); }
              }}
              disabled={!canDeploy || isDeploying}
              className="px-5 py-2.5 rounded-lg text-[12px] font-bold transition-all flex items-center gap-2"
              style={{
                background: canDeploy && !isDeploying ? "var(--ps-accent)" : "rgba(255,255,255,0.04)",
                color: canDeploy && !isDeploying ? "#000" : "var(--ps-cream-25)",
                opacity: canDeploy && !isDeploying ? 1 : 0.5,
                cursor: canDeploy && !isDeploying ? "pointer" : "not-allowed",
              }}
            >
              {isDeploying ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Publicando...
                </>
              ) : (
                <>🚀 Deploy</>
              )}
            </button>
          )}
        </motion.div>

        {/* Rating feedback */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 text-center pb-6"
        >
          {!feedbackSent ? (
            <div>
              <div className="text-[11px] mb-2" style={{ color: "var(--ps-cream-40)" }}>Como ficou o resultado?</div>
              <div className="flex gap-1 justify-center">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => handleRating(n)} className="transition-transform hover:scale-125">
                    <Star
                      className="w-5 h-5"
                      style={{ color: n <= feedbackRating ? "var(--ps-accent)" : "var(--ps-cream-15)" }}
                      fill={n <= feedbackRating ? "var(--ps-accent)" : "none"}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px]" style={{ color: "var(--ps-cream-25)" }}>
              ⭐ Obrigado pelo feedback ({feedbackRating}/5)
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
