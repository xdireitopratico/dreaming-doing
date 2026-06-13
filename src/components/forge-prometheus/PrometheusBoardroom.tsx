/**
 * PrometheusBoardroom — Planning chat (NO Canvas)
 * Phases: discovery → clarification → planning
 * Canvas is in PrometheusStreaming (building phase)
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { PrometheusParticles } from "./PrometheusParticles";
import { PrometheusBoardroomAgent } from "./PrometheusBoardroomAgent";
import { PrometheusBoardroomTurn } from "./PrometheusBoardroomTurn";
import { PrometheusBoardroomFeedbackBar } from "./PrometheusBoardroomFeedbackBar";
import "./prometheus-studio.css";

export type BoardroomPhase =
  | "discovery" | "clarification" | "planning" | "approval"
  | "building" | "testing" | "review" | "deploying" | "complete";

export interface BoardroomMessage {
  agent: string;
  content: string;
  timestamp: number;
  type: "analysis" | "architecture" | "prompt_write" | "test_result" | "decision" | "user_input";
  phase: BoardroomPhase;
  metadata?: Record<string, unknown>;
}

interface Props {
  messages: BoardroomMessage[];
  isStreaming: boolean;
  currentPhase: BoardroomPhase;
  phaseIndex: number;
  ready?: boolean;
  onStartBuild?: () => void;
  onSkip?: () => void;
  onBack?: () => void;
  onSendFeedback?: (text: string) => void;
  onAdvance?: () => void;
  error?: string | null;
}

export const PROMETHEUS_AGENTS = [
  { id: "cortex",    name: "Cortex",    icon: "🧠", color: "hsl(210 100% 60%)", role: "Orquestrador" },
  { id: "analyst",   name: "Analyst",   icon: "🔍", color: "hsl(142 70% 45%)",  role: "Requisitos" },
  { id: "architect", name: "Architect", icon: "🏗️", color: "hsl(25 100% 50%)",  role: "Fluxos" },
  { id: "scribe",    name: "Scribe",    icon: "✍️", color: "hsl(271 80% 55%)",  role: "Prompts" },
  { id: "sentinel",  name: "Sentinel",  icon: "🛡️", color: "hsl(0 70% 50%)",   role: "Testes" },
] as const;

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  analysis:      { label: "Analisa",    color: "hsl(142 70% 45%)" },
  architecture:  { label: "Projeta",    color: "hsl(25 100% 50%)" },
  prompt_write:  { label: "Escreve",    color: "hsl(271 80% 55%)" },
  test_result:   { label: "Testa",      color: "hsl(0 70% 50%)" },
  decision:      { label: "Decide",     color: "hsl(210 100% 60%)" },
  user_input:    { label: "Você",       color: "hsl(40 30% 85%)" },
};

function humanizeError(error: string): string {
  if (error.includes("Timeout")) return "⏱ Os agentes demoraram demais para responder. Tente novamente ou simplifique sua descrição.";
  if (error.includes("quality_model")) return "⚙️ Modelo de IA não selecionado. Volte e selecione um modelo no motor de prompt.";
  if (error.includes("Unauthorized") || error.includes("401")) return "🔒 Sessão expirada. Faça login novamente.";
  if (error.includes("network") || error.includes("fetch")) return "🌐 Problema de conexão. Verifique sua internet e tente novamente.";
  if (error.includes("500") || error.includes("Internal")) return "⚠️ Erro interno. Nossa equipe foi notificada — tente novamente em instantes.";
  return `⚠️ ${error}`;
}

const PLANNING_PHASES: BoardroomPhase[] = ["discovery", "clarification", "planning"];

export function PrometheusBoardroom({
  messages, isStreaming, currentPhase,
  ready = true, onStartBuild,
  onSkip, onBack, onSendFeedback, onAdvance,
  error,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const handleBack = useCallback(() => {
    if (isStreaming) {
      setShowLeaveDialog(true);
    } else {
      onBack?.();
    }
  }, [isStreaming, onBack]);

  const confirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    onBack?.();
  }, [onBack]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (messages.length > 0) setActiveAgent(messages[messages.length - 1].agent);
  }, [messages]);

  const getAgent = (id: string) => PROMETHEUS_AGENTS.find(a => a.id === id) || { id, name: id === "user" ? "Você" : id, icon: id === "user" ? "👤" : "🤖", color: "hsl(40 30% 85%)", role: id === "user" ? "Usuário" : id };

  const agentsSpokeSet = useMemo(() => new Set(messages.map(m => m.agent)), [messages]);
  const planningDone = !isStreaming && !PLANNING_PHASES.includes(currentPhase) && messages.length > 0;

  // Pre-start screen
  void ready;
  void onStartBuild;

  // Determine the streaming label: skip "user" and show the expected next agent
  const streamingAgentLabel = useMemo(() => {
    if (!isStreaming) return "";
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage) return "Cortex";
    if (lastMessage.agent === "user") return "";
    if (lastMessage.metadata?.questions || lastMessage.phase === "approval") return "";

    return getAgent(lastMessage.agent).name;
  }, [isStreaming, messages]);

  return (
    <div className="prometheus-studio relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden" style={{ background: "var(--ps-bg)" }}>
      <PrometheusParticles />

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="flex flex-shrink-0 items-center gap-2 border-b px-3 py-2 sm:px-4"
          style={{ borderColor: "var(--ps-border)", background: "var(--ps-bg-deep)" }}
        >
          <button
            type="button"
            onClick={handleBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors"
            style={{
              borderColor: "var(--ps-border)",
              background: "var(--ps-bg-surface)",
              color: "var(--ps-cream-80)",
            }}
            aria-label="Voltar"
            title="Voltar"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 flex-1 justify-center gap-2 sm:gap-3">
            {PROMETHEUS_AGENTS.map((agent) => (
              <PrometheusBoardroomAgent
                key={agent.id}
                agent={agent}
                isActive={activeAgent === agent.id}
                hasSpoken={agentsSpokeSet.has(agent.id)}
                isStreaming={isStreaming}
              />
            ))}
          </div>

          {planningDone && onAdvance ? (
            <button
              type="button"
              onClick={onAdvance}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all hover:scale-[1.02] sm:px-3 sm:text-xs"
              style={{ background: "var(--ps-accent)", color: "var(--ps-bg-deep)" }}
            >
              Ver Proposta →
            </button>
          ) : (
            <div className="w-8 shrink-0 sm:w-[7.5rem]" aria-hidden />
          )}
        </header>

        {/* Error with recovery actions */}
        {error && (
          <div
            className="mx-4 mt-1 flex flex-shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <span className="text-xs" style={{ color: "hsl(0 70% 65%)" }}>
              ⚠️ {humanizeError(error)}
            </span>
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  onClick={onBack}
                  className="flex-shrink-0 rounded px-3 py-1 text-[10px] font-semibold"
                  style={{ background: "rgba(239,68,68,0.1)", color: "hsl(0 70% 65%)" }}
                >
                  ← Voltar
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={messagesScrollRef}
            className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <AnimatePresence>
              {false && isStreaming && messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}
                >
                  <span className="text-base">🧠</span>
                  <span className="text-xs" style={{ color: "var(--ps-cream-80)" }}>
                    5 agentes estão planejando seu agente...
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <PrometheusBoardroomTurn
                  key={`${msg.agent}-${msg.timestamp}-${idx}`}
                  message={msg}
                  agent={getAgent(msg.agent)}
                  typeLabel={TYPE_LABELS[msg.type] || TYPE_LABELS.decision}
                />
              ))}
            </AnimatePresence>

            {isStreaming && streamingAgentLabel && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pl-8">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{ background: "var(--ps-accent)", animationDelay: `${i * 0.3}s` }}
                    />
                  ))}
                </div>
                <span className="text-[10px] italic" style={{ color: "var(--ps-cream-25)" }}>
                  {`${streamingAgentLabel} está elaborando...`}
                </span>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {isStreaming && onSkip && (
            <div className="flex-shrink-0 px-6 pb-1 flex justify-end">
              <button
                type="button"
                onClick={onSkip}
                className="rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
                style={{ background: "rgba(239,68,68,0.12)", color: "hsl(0 70% 65%)", border: "1px solid rgba(239,68,68,0.25)" }}
              >
                Parar
              </button>
            </div>
          )}

          {onSendFeedback && (
            <PrometheusBoardroomFeedbackBar isStreaming={isStreaming} onSendFeedback={onSendFeedback} />
          )}
        </div>
      </div>

      {/* Leave dialog */}
      <AnimatePresence>
        {showLeaveDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowLeaveDialog(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="w-full max-w-sm mx-4 rounded-xl p-5"
              style={{ background: "var(--ps-bg)", border: "1px solid var(--ps-border)" }}
              onClick={e => e.stopPropagation()}>
              <div className="text-2xl text-center mb-2">⚠️</div>
              <h3 className="text-sm font-bold text-center mb-1" style={{ color: "var(--ps-cream)" }}>Sessão em andamento</h3>
              <p className="text-xs text-center mb-4" style={{ color: "var(--ps-cream-60)" }}>
                Sair agora pode prejudicar o planejamento. O progresso será salvo.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowLeaveDialog(false)}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--ps-cream-60)", border: "1px solid var(--ps-border)" }}>
                  Continuar
                </button>
                <button onClick={confirmLeave}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: "rgba(239,68,68,0.15)", color: "hsl(0 70% 65%)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  Sair
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
