/**
 * PrometheusBoardroomProgress — 9-phase progress indicator
 */
import { motion } from "framer-motion";
import type { BoardroomPhase } from "./PrometheusBoardroom";

const PHASES: { id: BoardroomPhase; icon: string; label: string }[] = [
  { id: "discovery", icon: "🧠", label: "Descoberta" },
  { id: "clarification", icon: "🔍", label: "Clarificação" },
  { id: "planning", icon: "📋", label: "Planejamento" },
  { id: "approval", icon: "✅", label: "Aprovação" },
  { id: "building", icon: "🔨", label: "Construção" },
  { id: "testing", icon: "🧪", label: "Testes" },
  { id: "review", icon: "👁️", label: "Revisão" },
  { id: "deploying", icon: "🚀", label: "Deploy" },
  { id: "complete", icon: "🏆", label: "Concluído" },
];

interface Props {
  currentPhase: BoardroomPhase;
  phaseIndex: number;
}

export function PrometheusBoardroomProgress({ currentPhase, phaseIndex }: Props) {
  const progress = ((phaseIndex + 1) / PHASES.length) * 100;

  return (
    <div className="flex-shrink-0 px-4 pb-2 pt-4 sm:px-6">
      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
        {PHASES.map((phase, index) => {
          const isCompleted = index < phaseIndex;
          const isCurrent = phase.id === currentPhase;

          return (
            <div key={phase.id} className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all"
                style={{
                  background: isCurrent
                    ? "rgba(59,130,246,0.16)"
                    : isCompleted
                      ? "rgba(52,211,153,0.12)"
                      : "rgba(255,255,255,0.03)",
                  color: isCurrent
                    ? "var(--ps-cream)"
                    : isCompleted
                      ? "hsl(142 70% 55%)"
                      : "var(--ps-cream-60)",
                  border: `1px solid ${
                    isCurrent
                      ? "rgba(59,130,246,0.28)"
                      : isCompleted
                        ? "rgba(52,211,153,0.2)"
                        : "var(--ps-border)"
                  }`,
                }}
              >
                <span>{phase.icon}</span>
                <span>{phase.label}</span>
              </div>
              {index < PHASES.length - 1 && (
                <div
                  className="h-px w-5"
                  style={{ background: isCompleted ? "hsl(142 70% 45%)" : "var(--ps-border)" }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, var(--ps-accent), hsl(142 70% 45%))" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
