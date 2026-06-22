// runtime/phases/plan-turn-host.ts — Wiring plan-turn no loop host (Fase 2.3)
import type { SkillRegistry } from "../../skills.ts";
import type { AgentState, LLMProvider, ProposedPlan } from "../../types.ts";
import type { AgentLoopRunResult } from "../loop-result.ts";
import type { AgentLoopMutableState } from "../loop-mutable-state.ts";
import type { LoopBindings } from "../deps-factory.ts";
import {
  finishPlanProposal as finishPlanTurnProposal,
  runPlanModeAgentTurn as runPlanModeAgentTurnPhase,
  type PlanModeStreamState,
} from "./plan-turn.ts";

export type PlanTurnLoopHost = {
  state: AgentState;
  skills: SkillRegistry;
  mutable: AgentLoopMutableState;
  planStreamState: PlanModeStreamState;
  thinkingStreamStartedAt: number | null;
  setThinkingStreamStartedAt: (value: number | null) => void;
  bindings: LoopBindings;
};

export async function finishPlanProposalForHost(
  host: PlanTurnLoopHost,
  proposedPlan: ProposedPlan,
  toolsUsed: string[] = [],
): Promise<AgentLoopRunResult> {
  return finishPlanTurnProposal(host.bindings.planTurnFinish(), proposedPlan, toolsUsed);
}

export async function runPlanModeAgentTurnForHost(
  host: PlanTurnLoopHost,
  model: LLMProvider,
): Promise<AgentLoopRunResult> {
  const skillPrompt = host.state.context
    ? host.skills.buildSkillPrompt(host.state.context.files)
    : "";
  host.planStreamState.llmResponseWasStreamed = host.mutable.llmResponseWasStreamed;
  host.planStreamState.thinkingStreamStartedAt = host.thinkingStreamStartedAt;

  const result = await runPlanModeAgentTurnPhase(host.bindings.buildPlanTurn(skillPrompt), model);

  host.mutable.llmResponseWasStreamed = host.planStreamState.llmResponseWasStreamed;
  host.setThinkingStreamStartedAt(host.planStreamState.thinkingStreamStartedAt);
  return result;
}