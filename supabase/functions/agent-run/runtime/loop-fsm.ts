// runtime/loop-fsm.ts — Transições FSM do loop (interno — sem evento SSE).
import { applyTransition, type AgentStateData } from "../agent-fsm.ts";

export async function emitLoopFsmTransition(
  fsmState: AgentStateData,
  eventType: string,
  _emit: (type: string, data: unknown) => void,
  data?: unknown,
): Promise<AgentStateData> {
  const result = applyTransition(fsmState, {
    type: eventType as never,
    data,
    timestamp: Date.now(),
  });
  return result.ok ? result.state : fsmState;
}