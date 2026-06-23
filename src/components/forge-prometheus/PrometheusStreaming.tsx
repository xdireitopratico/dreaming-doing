/**
 * PrometheusStreaming — Building phase with live Canvas
 * Shows real-time agent construction progress after user approval.
 * Canvas + progress indicator + timer.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PrometheusParticles } from "./PrometheusParticles";
import { PrometheusLiveCanvas } from "@/components/forge-agents/prometheus/PrometheusLiveCanvas";
import { PrometheusBoardroomProgress } from "./PrometheusBoardroomProgress";
import { PrometheusTrialPlayground } from "./PrometheusTrialPlayground";
import { PROMETHEUS_AGENTS } from "./PrometheusBoardroom";
import type { BoardroomMessage, BoardroomPhase } from "./PrometheusBoardroom";
import type { Node, Edge } from "@/types/xyflow-react-shim";
import "./prometheus-studio.css";

interface Props {
  messages: BoardroomMessage[];
  isStreaming: boolean;
  currentPhase: BoardroomPhase;
  phaseIndex: number;
  canvasNodes: Node[];
  canvasEdges: Edge[];
  error?: string | null;
  flowId?: string;
  agentName?: string;
  tokenUsage?: { used: number; budget: number };
  onBack?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
}

// Building phases (4-8)
const BUILD_PHASES: { key: BoardroomPhase; label: string; icon: string }[] = [
  { key: "building",  label: "Construindo nós",   icon: "🏗️" },
  { key: "testing",   label: "Testando fluxo",    icon: "🧪" },
  { key: "review",    label: "Revisão interna",   icon: "📋" },
  { key: "deploying", label: "Preparando deploy",  icon: "🚀" },
  { key: "complete",  label: "Concluído!",        icon: "✅" },
];

export function PrometheusStreaming({
  messages, isStreaming, currentPhase, phaseIndex,
  canvasNodes, canvasEdges,
  error, flowId, agentName, tokenUsage, onBack, onCancel, onComplete,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [showPlayground, setShowPlayground] = useState(false);
  const startTimeRef = useRef(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // Timer
  useEffect(() => {
    if (!isStreaming && currentPhase === "complete") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, currentPhase]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isComplete = currentPhase === "complete" || currentPhase === "review";

  // Current build step
  const currentBuildStep = useMemo(() => {
    return BUILD_PHASES.findIndex(p => p.key === currentPhase);
  }, [currentPhase]);

  // Building messages only (from building phase onward)
  const buildMessages = useMemo(() => {
    const buildPhases: BoardroomPhase[] = ["building", "testing", "review", "deploying", "complete"];
    return messages.filter(m => buildPhases.includes(m.phase));
  }, [messages]);

  const handleBack = useCallback(() => {
    if (isStreaming) {
      setShowLeaveDialog(true);
    } else {
      onBack?.();
    }
  }, [isStreaming, onBack]);

  const getAgent = (id: string) => PROMETHEUS_AGENTS.find(a => a.id === id) || {
    id, name: id === "user" ? "Você" : id, icon: id === "user" ? "👤" : "🤖",
    color: "hsl(40 30% 85%)", role: id === "user" ? "Usuário" : id,
  };

  return (
    <div className="prometheus-studio relative" style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--ps-bg)" }}>
      <PrometheusParticles />

      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--ps-border)" }}>
          <div className="flex flex-wrap items-center gap-3">
            {onBack && (
              <button onClick={handleBack}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--ps-cream-80)", border: "1px solid var(--ps-border)" }}>
                ← Voltar
              </button>
            )}
            {isStreaming && onCancel && (
              <button onClick={onCancel}
                className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{ background: "rgba(239,68,68,0.08)", color: "hsl(0 70% 65%)", border: "1px solid rgba(239,68,68,0.2)" }}>
                ✖ Cancelar
              </button>
            )}
            <div className="h-5 w-px" style={{ background: "var(--ps-border)" }} />
            <span className="text-xs sm:text-sm tracking-[0.18em] uppercase" style={{ color: "var(--ps-accent-dim)" }}>
              Construindo seu Agente
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Timer */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}>
              <span className="text-xs" style={{ color: "var(--ps-cream-60)" }}>⏱</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: "var(--ps-accent)" }}>
                {formatTime(elapsed)}
              </span>
            </div>

            {isComplete && flowId && !showPlayground && (
              <button
                onClick={() => setShowPlayground(true)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{ background: "rgba(245,158,11,0.15)", color: "hsl(38 92% 50%)", border: "1px solid rgba(245,158,11,0.3)" }}
              >
                🧪 Testar Agente
              </button>
            )}
            {isComplete && onComplete && (
              <button
                onClick={onComplete}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{ background: "var(--ps-accent)", color: "#000" }}
              >
                ✅ Ver Resultado →
              </button>
            )}
          </div>
        </div>

        {/* Build steps progress */}
        <div className="flex-shrink-0 px-6 py-3">
          <div className="flex items-center gap-2">
            {BUILD_PHASES.map((step, i) => {
              const isDone = currentBuildStep > i;
              const isCurrent = currentBuildStep === i;
              return (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-1 min-w-0 transition-all"
                    style={{
                      background: isDone ? "rgba(52,211,153,0.1)" : isCurrent ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isDone ? "rgba(52,211,153,0.2)" : isCurrent ? "rgba(59,130,246,0.2)" : "var(--ps-border)"}`,
                    }}>
                    <span className="text-[12px]">{isDone ? "✅" : isCurrent && isStreaming ? "⏳" : step.icon}</span>
                    <span className="text-[9px] font-medium truncate" style={{
                      color: isDone ? "hsl(142 70% 55%)" : isCurrent ? "var(--ps-accent)" : "var(--ps-cream-25)",
                    }}>
                      {step.label}
                    </span>
                  </div>
                  {i < BUILD_PHASES.length - 1 && (
                    <div className="w-4 h-px flex-shrink-0" style={{
                      background: isDone ? "hsl(142 70% 55%)" : "var(--ps-border)",
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 18: Token budget progress */}
        {tokenUsage && tokenUsage.budget > 0 && (
          <div className="flex-shrink-0 px-6 pb-2">
            {(() => {
              const pct = Math.min(100, Math.round((tokenUsage.used / tokenUsage.budget) * 100));
              const isWarning = pct > 80;
              return (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: isWarning ? "hsl(38 92% 50%)" : "var(--ps-accent)",
                        opacity: isWarning ? 1 : 0.6,
                      }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums whitespace-nowrap" style={{
                    color: isWarning ? "hsl(38 92% 50%)" : "var(--ps-cream-40)",
                  }}>
                    {isWarning ? "⚠️ " : ""}Raciocínio: {pct}%
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex-shrink-0 mx-4 mb-2 px-4 py-3 rounded-xl flex items-center gap-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <span className="text-[14px]">⚠️</span>
            <span className="text-[11px] font-medium" style={{ color: "hsl(0 70% 65%)" }}>
              {error}
            </span>
          </div>
        )}

        {/* ═══ SPLIT: Canvas | Activity Log ═══ */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Canvas — main area */}
          <div className="flex-1 min-h-0" style={{ borderRight: "1px solid var(--ps-border)" }}>
            {canvasNodes.length > 0 ? (
              <PrometheusLiveCanvas
                nodes={canvasNodes}
                edges={canvasEdges}
                readOnly
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="text-[48px] mb-4 animate-pulse">🏗️</div>
                  <div className="text-[14px] font-medium mb-2" style={{ color: "var(--ps-cream-60)" }}>
                    Construindo estrutura do agente...
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--ps-cream-25)" }}>
                    Os nós aparecerão aqui conforme forem criados
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar — Playground or Activity log */}
          <div className="w-[320px] lg:w-[360px] flex-shrink-0 flex flex-col min-h-0">
            {showPlayground && flowId ? (
              <PrometheusTrialPlayground flowId={flowId} agentName={agentName} />
            ) : (
              <>
                <div className="px-4 py-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--ps-border)" }}>
                  <span className="text-[10px] tracking-[2px] uppercase font-medium" style={{ color: "var(--ps-cream-40)" }}>
                    📋 Atividade dos Agentes
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {buildMessages.length === 0 && isStreaming && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: "rgba(59,130,246,0.05)" }}>
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ background: "var(--ps-accent)", animationDelay: `${i * 0.3}s` }} />
                        ))}
                      </div>
                      <span className="text-[10px]" style={{ color: "var(--ps-cream-40)" }}>
                        Iniciando construção...
                      </span>
                    </div>
                  )}
                  {buildMessages.map((msg, idx) => {
                    const agent = getAgent(msg.agent);
                    return (
                      <motion.div
                        key={`${msg.agent}-${msg.timestamp}-${idx}`}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-2 px-3 py-2 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.02)" }}
                      >
                        <span className="text-[14px] flex-shrink-0 mt-0.5">{agent.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[10px] font-semibold" style={{ color: agent.color }}>
                              {agent.name}
                            </span>
                            <span className="text-[8px]" style={{ color: "var(--ps-cream-25)" }}>
                              {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div className="text-[10px] leading-relaxed" style={{ color: "var(--ps-cream-60)" }}>
                            {msg.content.length > 150 ? msg.content.slice(0, 150) + "..." : msg.content}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--ps-border)", background: "linear-gradient(180deg, rgba(10,12,20,0.6) 0%, rgba(10,12,20,0.9) 100%)" }}>
          <div className="text-[10px] tracking-[1px] uppercase" style={{ color: "var(--ps-cream-25)" }}>
            {isComplete ? "✅ Agente construído com sucesso!" : isStreaming ? `🏗️ Construindo... ${formatTime(elapsed)}` : "Aguardando..."}
          </div>
          {isComplete && onComplete && (
            <button
              onClick={onComplete}
              className="px-5 py-2 rounded-lg text-[11px] font-bold transition-all flex-shrink-0 hover:scale-[1.02]"
              style={{ background: "var(--ps-accent)", color: "#000" }}
            >
              ✅ Ver Resultado →
            </button>
          )}
        </div>
      </div>

      {/* Leave dialog */}
      <AnimatePresence>
        {showLeaveDialog && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowLeaveDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-[420px] mx-4 rounded-2xl p-6"
              style={{ background: "var(--ps-bg)", border: "1px solid var(--ps-border)" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="text-[32px] text-center mb-3">⚠️</div>
              <h3 className="text-[16px] font-bold text-center mb-2" style={{ color: "var(--ps-cream)" }}>
                Construção em andamento
              </h3>
              <p className="text-[12px] text-center leading-relaxed mb-6" style={{ color: "var(--ps-cream-60)" }}>
                Seu agente está sendo construído. Sair agora pode resultar em um agente incompleto.
                O progresso será salvo e você poderá retomar.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowLeaveDialog(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--ps-cream-60)", border: "1px solid var(--ps-border)" }}>
                  Continuar
                </button>
                <button onClick={() => { setShowLeaveDialog(false); onBack?.(); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-semibold"
                  style={{ background: "rgba(239,68,68,0.15)", color: "hsl(0 70% 65%)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  Sair mesmo assim
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
