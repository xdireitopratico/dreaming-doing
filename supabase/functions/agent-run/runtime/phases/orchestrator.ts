// runtime/phases/orchestrator.ts — Routing do run() (Fase 2.2)
import { deriveClassificationFromPrompt, type ClassificationResult } from "../../router.ts";
import { resumeStepStart } from "../../checkpoint.ts";
import { calculateMaxSteps } from "../loop-config.ts";
import type { IntentAnalysis, LLMProvider, LoopPhase } from "../../types.ts";
import { LoopPhase as LoopPhaseEnum } from "../../types.ts";
import type { PlanTurnRunResult, PlanTurnEmit } from "./plan-turn.ts";
import type { AgentStateData } from "../../agent-fsm.ts";
import type { LoopUpdateContext } from "../../loop-status.ts";
import {
  appendResumeInstruction,
  buildApprovedClassification,
  isProjectInventoryQuestion,
  resolveUserPrompt,
  runInventoryGate,
  runShowExistingPlanGate,
  type GateReplyDeps,
} from "./gate-replies.ts";
import type { ProposedPlan } from "../../types.ts";
import { GATHER_PHASE_MESSAGE } from "../phase-messages.ts";

export type OrchestratorDeps = GateReplyDeps & {
  resumeRun: boolean;
  hasCheckpoint: boolean;
  resumePhase: LoopPhase | null;
  approvedPlanBuild: boolean;
  skipConversationalGate: boolean;
  complexityScore: number;
  setComplexityScore: (score: number) => void;
  maxStepsLimit: number;
  setMaxStepsLimit: (limit: number) => void;
  toolsUsed: Set<string>;
  fsmStateName: string;
  emitTransition: (eventType: string, data?: unknown) => Promise<void>;
  notifyLoopStatus: (ctx: LoopUpdateContext) => void;
  applyAutoModelForComplexity: (complexity: number) => void;
  configuredModel: () => LLMProvider;
  loopBudgetExceeded: () => boolean;
  returnResumableChunk: (
    steps: number,
    toolsUsed: Set<string>,
  ) => Promise<PlanTurnRunResult>;
  gatherContext: () => Promise<void>;
  saveCheckpoint: (phase: LoopPhaseEnum) => Promise<void>;
  runPlanModeAgentTurn: (model: LLMProvider) => Promise<PlanTurnRunResult>;
  finishPlanProposal: (plan: ProposedPlan) => Promise<PlanTurnRunResult>;
  runBuildExecute: (
    toolsUsed: Set<string>,
    model: LLMProvider,
    initialStep: number,
  ) => Promise<PlanTurnRunResult>;
  buildFixResume: boolean;
};

export async function runAgentOrchestrator(
  deps: OrchestratorDeps,
): Promise<PlanTurnRunResult> {
  let executionModel = deps.configuredModel();

  if (deps.resumeRun && deps.hasCheckpoint) {
    await deps.emitTransition("send");
    deps.applyAutoModelForComplexity(deps.complexityScore);
    deps.notifyLoopStatus({
      kind: "resume",
      fixResume: deps.buildFixResume,
    });
    await deps.emitTransition("classified", {
      complexity: deps.complexityScore,
      summary: deps.state.intent?.summary ?? "Retomada",
      restored: true,
    });
    deps.emit("classify", {
      complexity: deps.state.intent?.complexity ?? "unknown",
      complexityScore: deps.complexityScore,
      summary: deps.state.intent?.summary ?? "Retomada",
      restored: true,
    });
    if (deps.planMode) {
      return deps.runPlanModeAgentTurn(executionModel);
    }
    await deps.emitTransition("no_plan_needed");
  } else {
    if (
      !deps.resumeRun &&
      !deps.approvedPlanBuild &&
      deps.planMode &&
      deps.originalUserRequest
    ) {
      const showPlan = await runShowExistingPlanGate(deps, deps.finishPlanProposal);
      if (showPlan) return showPlan;
    }

    if (deps.resumeRun) {
      appendResumeInstruction(deps.state.messages);
      deps.emit("phase", { phase: "resume", message: "" });
    }

    if (deps.loopBudgetExceeded()) {
      return deps.returnResumableChunk(0, deps.toolsUsed);
    }
    deps.emit("phase", { phase: "gather", message: GATHER_PHASE_MESSAGE });
    deps.emit("explore", { message: GATHER_PHASE_MESSAGE, phase: "gather" });
    await deps.gatherContext();
    if (deps.loopBudgetExceeded()) {
      return deps.returnResumableChunk(0, deps.toolsUsed);
    }
    await deps.saveCheckpoint(LoopPhaseEnum.GATHER_CONTEXT);

    const isApprovedOrSkip = deps.approvedPlanBuild || deps.skipConversationalGate;
    const userPrompt = resolveUserPrompt(deps.state.messages, deps.originalUserRequest);

    const classification: ClassificationResult = isApprovedOrSkip
      ? buildApprovedClassification(deps.complexityScore, userPrompt)
      : deriveClassificationFromPrompt(userPrompt, deps.planMode);

    if (deps.loopBudgetExceeded()) {
      return deps.returnResumableChunk(0, deps.toolsUsed);
    }

    deps.setComplexityScore(classification.complexity);
    deps.state.intent = {
      type: classification.type as IntentAnalysis["type"],
      summary: classification.summary,
      scope: [],
      complexity: "medium",
    };
    deps.setMaxStepsLimit(calculateMaxSteps(classification.complexity));
    deps.applyAutoModelForComplexity(classification.complexity);
    executionModel = deps.configuredModel();

    if (deps.fsmStateName === "idle") {
      await deps.emitTransition("send");
    }
    await deps.emitTransition("classified", classification);

    if (
      deps.originalUserRequest &&
      isProjectInventoryQuestion(deps.originalUserRequest) &&
      !deps.planMode
    ) {
      return runInventoryGate(deps, executionModel);
    }

    if (deps.planMode) {
      return deps.runPlanModeAgentTurn(executionModel);
    }

    deps.emit("phase", {
      phase: "build",
      message: "",
      intent: deps.state.intent,
    });

    if (deps.approvedPlanBuild) {
      deps.emit("phase", { phase: "build", message: "" });
    }

    if (deps.fsmStateName === "planning") {
      await deps.emitTransition("no_plan_needed");
    }
  }

  if (deps.planMode) {
    await deps.clearCheckpoint();
    return {
      ok: false,
      error: "Plan mode não executa ferramentas — apenas propõe plano.",
      steps: 0,
      toolsUsed: [...deps.toolsUsed],
    };
  }

  const step =
    deps.resumeRun && deps.hasCheckpoint
      ? resumeStepStart(deps.resumePhase ?? deps.state.phase, deps.state.currentStepIndex)
      : 0;

  return deps.runBuildExecute(deps.toolsUsed, executionModel, step);
}