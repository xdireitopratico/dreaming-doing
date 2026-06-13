/**
 * PrometheusStreamingPage — Building phase with live Canvas
 * Wraps PrometheusStreaming with usePrometheusBoardroom hook
 * This phase starts construction after architecture_brief approval
 */
import { useEffect } from "react";
import { PrometheusStreaming } from "./PrometheusStreaming";
import { usePrometheusBoardroom } from "./hooks/usePrometheusBoardroom";
import type { BoardroomPhase } from "./PrometheusBoardroom";

interface Props {
  flowId: string;
  onBack: () => void;
  onComplete: () => void;
  onWorkflowPhaseChange?: (phase: BoardroomPhase) => void;
}

export function PrometheusStreamingPage({ flowId, onBack, onComplete, onWorkflowPhaseChange }: Props) {
  const boardroom = usePrometheusBoardroom(flowId);

  useEffect(() => {
    onWorkflowPhaseChange?.(boardroom.currentPhase);
  }, [boardroom.currentPhase, onWorkflowPhaseChange]);

  return (
    <PrometheusStreaming
      messages={boardroom.messages}
      isStreaming={boardroom.isStreaming}
      currentPhase={boardroom.currentPhase}
      phaseIndex={boardroom.phaseIndex}
      canvasNodes={boardroom.canvasNodes}
      canvasEdges={boardroom.canvasEdges}
      error={boardroom.error}
      flowId={flowId}
      tokenUsage={boardroom.tokenUsage ?? undefined}
      onBack={onBack}
      onCancel={boardroom.skip}
      onComplete={onComplete}
    />
  );
}
