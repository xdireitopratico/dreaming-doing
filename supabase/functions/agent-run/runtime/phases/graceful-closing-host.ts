// runtime/phases/graceful-closing-host.ts — Wiring graceful closing (Fase 2.4)
import type { AgentState, LLMProvider, ProposedPlan } from "../../types.ts";
import { attemptGracefulClosing as attemptGracefulClosingPhase } from "./graceful-closing.ts";

export type GracefulClosingHost = {
  state: AgentState;
  configuredModel: () => LLMProvider;
  finishPlanProposal: (plan: ProposedPlan) => Promise<void>;
};

export async function attemptGracefulClosingForHost(
  host: GracefulClosingHost,
  reason: "tool_miss" | "build_fail" | "plan_stuck",
): Promise<string | null> {
  return attemptGracefulClosingPhase(
    {
      messages: host.state.messages,
      configuredModel: () => host.configuredModel(),
      finishPlanProposal: (proposed) => host.finishPlanProposal(proposed),
    },
    reason,
  );
}