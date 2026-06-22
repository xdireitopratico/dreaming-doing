// runtime/loop-fsm.ts — Transições FSM do loop (Fase 2.2)
import { applyTransition, type AgentStateData } from "../agent-fsm.ts";

export async function emitLoopFsmTransition(
  fsmState: AgentStateData,
  eventType: string,
  emit: (type: string, data: unknown) => void,
  data?: unknown,
): Promise<AgentStateData> {
  const result = applyTransition(fsmState, {
    type: eventType as never,
    data,
    timestamp: Date.now(),
  });
  const next = result.ok ? result.state : fsmState;
  emit("fsm_transition", {
    from: result.from,
    to: result.to,
    event: eventType,
    ok: result.ok,
    error: result.error,
    stateName: next.name,
  });
  return next;
}