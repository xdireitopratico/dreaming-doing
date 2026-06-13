/**
 * PrometheusBoardroomPage — Page wrapper for planning phase (chat-only)
 * No canvas — canvas is in PrometheusStreamingPage (building phase)
 */
import { useEffect } from "react";
import { PrometheusBoardroom } from "./PrometheusBoardroom";
import { usePrometheusBoardroom } from "./hooks/usePrometheusBoardroom";
import type { BoardroomPhase } from "./PrometheusBoardroom";

interface Props {
  flowId: string;
  onBack: () => void;
  onAdvance: () => void;
  onWorkflowPhaseChange?: (phase: BoardroomPhase) => void;
  onConvergenceChange?: (score: number, round: number) => void;
}

export function PrometheusBoardroomPage({ flowId, onBack, onAdvance, onWorkflowPhaseChange, onConvergenceChange }: Props) {
  const boardroom = usePrometheusBoardroom(flowId);

  const displayPhase: BoardroomPhase = boardroom.currentPhase === "clarification"
    ? "planning"
    : boardroom.currentPhase;

  useEffect(() => {
    onWorkflowPhaseChange?.(displayPhase);
  }, [displayPhase, onWorkflowPhaseChange]);

  // Derive convergence from displayed planning phase only
  const PLANNING_PHASES: BoardroomPhase[] = ["discovery", "clarification", "planning"];
  const planIdx = PLANNING_PHASES.indexOf(displayPhase);
  const convergence = planIdx >= 0 ? Math.round(((planIdx + 1) / 3) * 100) : 100;
  const round = boardroom.messages.filter(m => m.type === "user_input").length + 1;

  useEffect(() => {
    onConvergenceChange?.(convergence, round);
  }, [convergence, round, onConvergenceChange]);

  return (
    <PrometheusBoardroom
      messages={boardroom.messages}
      isStreaming={boardroom.isStreaming}
      currentPhase={displayPhase}
      phaseIndex={boardroom.phaseIndex}
      error={boardroom.error}
      ready={boardroom.ready}
      onStartBuild={boardroom.startBuild}
      onBack={onBack}
      onSkip={boardroom.skip}
      onSendFeedback={boardroom.sendFeedback}
      onAdvance={onAdvance}
    />
  );
}
