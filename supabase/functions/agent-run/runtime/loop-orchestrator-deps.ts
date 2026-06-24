// runtime/loop-orchestrator-deps.ts — Deps do runAgentOrchestrator (Fase 2.4)
import { applyAutoModelForComplexity } from "./loop-auto-model.ts";
import { runBuildExecutePhase } from "./phases/execute.ts";
import type { OrchestratorDeps } from "./phases/orchestrator.ts";
import type { AgentPreferencesPayload } from "../connector-keys.ts";
import type { ModelRouter } from "../router.ts";
import type {
  AgentState,
  LLMProvider,
  LoopPhase,
  ProposedPlan,
} from "../types.ts";
import type { AgentStateData } from "../agent-fsm.ts";
import type { LoopBindings } from "./deps-factory.ts";
import type { LoopUpdateContext } from "../loop-status.ts";
import type { AgentLoopRunResult } from "./loop-result.ts";

export type LoopOrchestratorHost = {
  state: AgentState;
  originalUserRequest: string;
  planMode: boolean;
  chatMode: boolean;
  resumeRun: boolean;
  hasCheckpoint: boolean;
  resumePhase: LoopPhase | null;
  approvedPlanBuild: boolean;
  skipConversationalGate: boolean;
  complexityScore: number;
  setComplexityScore: (score: number) => void;
  maxStepsLimit: number;
  setMaxStepsLimit: (limit: number) => void;
  buildFixResume: boolean;
  designReadPathsDone: Set<string>;
  fsmState: AgentStateData;
  preferences: AgentPreferencesPayload | null;
  connectorKeys: Record<string, string>;
  llm: LLMProvider;
  router: ModelRouter;
  bindings: LoopBindings;
  emit: (type: string, data: unknown) => void;
  emitTransition: (eventType: string, data?: unknown) => Promise<void>;
  notifyLoopStatus: (ctx: LoopUpdateContext) => void;
  configuredModel: () => LLMProvider;
  loopBudgetExceeded: () => boolean;
  gatherContext: () => Promise<void>;
  runChatModeAgentTurn: (model: LLMProvider) => Promise<AgentLoopRunResult>;
  runPlanModeAgentTurn: (model: LLMProvider) => Promise<AgentLoopRunResult>;
  finishPlanProposal: (plan: ProposedPlan) => Promise<AgentLoopRunResult>;
};

export function buildOrchestratorDeps(
  host: LoopOrchestratorHost,
  toolsUsed: Set<string>,
): OrchestratorDeps {
  return {
    state: host.state,
    context: host.state.context,
    originalUserRequest: host.originalUserRequest,
    planMode: host.planMode,
    chatMode: host.chatMode,
    emit: (type, data) => host.emit(type, data),
    configuredModel: () => host.configuredModel(),
    persistFinal: (summary, opts) => host.bindings.persistFinal(summary, opts),
    clearCheckpoint: () => host.bindings.clearCheckpoint(),
    resumeRun: host.resumeRun,
    hasCheckpoint: host.hasCheckpoint,
    resumePhase: host.resumePhase,
    approvedPlanBuild: host.approvedPlanBuild,
    skipConversationalGate: host.skipConversationalGate,
    complexityScore: host.complexityScore,
    setComplexityScore: host.setComplexityScore,
    maxStepsLimit: host.maxStepsLimit,
    setMaxStepsLimit: host.setMaxStepsLimit,
    toolsUsed,
    fsmStateName: host.fsmState.name,
    emitTransition: (eventType, data) => host.emitTransition(eventType, data),
    notifyLoopStatus: (ctx) => host.notifyLoopStatus(ctx),
    applyAutoModelForComplexity: (complexity) =>
      applyAutoModelForComplexity({
        preferences: host.preferences,
        connectorKeys: host.connectorKeys,
        complexity,
        llm: host.llm,
        router: host.router,
      }),
    loopBudgetExceeded: () => host.loopBudgetExceeded(),
    returnResumableChunk: (steps, used) => host.bindings.returnResumableChunk(steps, used),
    gatherContext: () => host.gatherContext(),
    saveCheckpoint: (phase) => host.bindings.saveCheckpoint(phase),
    runChatModeAgentTurn: (model) => host.runChatModeAgentTurn(model),
    runPlanModeAgentTurn: (model) => host.runPlanModeAgentTurn(model),
    finishPlanProposal: (plan) => host.finishPlanProposal(plan),
    runBuildExecute: (used, model, step) =>
      runBuildExecutePhase(
        host.bindings.buildExecute(used, model, host.designReadPathsDone),
        step,
      ),
    buildFixResume: host.buildFixResume,
  };
}