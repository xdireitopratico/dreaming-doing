import { PENDING_RUN_ID } from "@/lib/pending-run-id";

export type AgentBusyInput = {
  running: boolean;
  activeRunId: string | null;
  finished: boolean;
  canceled: boolean;
  awaiting: boolean;
  connectInFlight: boolean;
};

/** Turno otimista (`__pending__`) não conta como run ativo — senão runAgent nunca conecta após send. */
export function isEditorAgentBusy(input: AgentBusyInput): boolean {
  const liveRun =
    input.activeRunId != null &&
    input.activeRunId !== PENDING_RUN_ID &&
    !input.finished &&
    !input.canceled &&
    !input.awaiting;

  return input.running || liveRun || input.connectInFlight;
}