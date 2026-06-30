// chat-turn-host.ts — Wiring chat-turn no loop host
import type { AgentState, LLMProvider } from "../../types.ts";
import type { AgentLoopMutableState } from "../loop-mutable-state.ts";
import type { LoopBindings } from "../deps-factory.ts";
import type { AgentLoopRunResult } from "../loop-result.ts";
import { runChatModeAgentTurn, type ChatTurnDeps } from "./chat-turn.ts";
import type { PlanModeStreamState } from "./plan-turn.ts";

export type ChatTurnLoopHost = {
  state: AgentState;
  mutable: AgentLoopMutableState;
  planStreamState: PlanModeStreamState;
  thinkingStreamStartedAt: number | null;
  setThinkingStreamStartedAt: (value: number | null) => void;
  bindings: LoopBindings;
  originalUserRequest: string;
  robinActive: boolean;
  onActivity: () => void;
};

export async function runChatModeAgentTurnForHost(
  host: ChatTurnLoopHost,
  model: LLMProvider,
): Promise<AgentLoopRunResult> {
  host.planStreamState.llmResponseWasStreamed = host.mutable.llmResponseWasStreamed;
  host.planStreamState.thinkingStreamStartedAt = host.thinkingStreamStartedAt;

  const finishDeps = host.bindings.planTurnFinish();
  const deps: ChatTurnDeps = {
    ...finishDeps,
    robinActive: host.robinActive,
    originalUserRequest: host.originalUserRequest,
    messages: host.state.messages,
    streamState: host.planStreamState,
    emit: finishDeps.emit,
    returnResumableChunk: host.bindings.returnResumableChunk,
    onActivity: host.onActivity,
  };

  const result = await runChatModeAgentTurn(deps, model);

  host.mutable.llmResponseWasStreamed = host.planStreamState.llmResponseWasStreamed;
  host.setThinkingStreamStartedAt(host.planStreamState.thinkingStreamStartedAt);
  return result;
}
