// runtime/phases/execute.ts — Loop principal de build/execute (Fase 2.2)
import { SessionContextManager, parallelExecute } from "../../compression.ts";
import type { RuntimeObserver } from "../../observer.ts";
import type { ModelRouter } from "../../router.ts";
import { buildExecuteInstruction } from "../../run-context.ts";
import { appendExecutionLogEntry } from "../../executionLogMeta.ts";
import { hashToolBatch, isExecutionStuck } from "../../../_shared/agent-stuck.ts";
import { logger } from "../../../_shared/logger.ts";
import {
  assistantContentForHistory,
  decideToolProgress,
  TOOL_FAIL_USER_MESSAGE,
} from "../../tool-progress.ts";
import { sanitizeUserFacingProse } from "../../sanitize-prose.ts";
import { resolveClosureText } from "../../loop-status.ts";
import {
  formatClarifyMessage,
  extractClarifyQuestions,
  hasMixedMetaAndExecution,
  splitMetaToolCalls,
} from "../../tools/meta.ts";
import { isAndroidNativePath, isBuildCommand } from "../loop-config.ts";
import type { PlanTurnRunResult, PlanTurnEmit } from "./plan-turn.ts";
import {
  buildStructuredToolContent,
  computeFilePreDiff,
  computeForceTools,
  computeNarrationOnlyStep,
  EXECUTE_MAX_LLM_RETRIES,
  EXECUTE_MAX_RETRIES,
  isActionableIntent,
  isUiPatchCall,
  normalizeDesignReadPath,
  recordDesignReadPath,
  shouldBlockTextOnlyCompletion,
  shouldEnforceNoToolCalls,
  shouldSuggestStackFork,
  updateReadOnlyTracker,
} from "./execute-helpers.ts";
import {
  evaluateReadGate,
  evaluateTurnGuidePreTurn,
  shouldLoopBackForZeroDelivery,
  ZERO_DELIVERY_LOOP_BACK_MESSAGE,
} from "../turn-guide.ts";
import { attemptOpeningProse } from "../turn-opening.ts";
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  DesignPlanField,
  LLMProvider,
  PlanStep,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "../../types.ts";
import type { ToolRegistry } from "../../registry.ts";
import type { PersistFinalOpts } from "./persist.ts";
import { LoopPhase as LoopPhaseEnum } from "../../types.ts";
import type { LoopUpdateContext } from "../../loop-status.ts";
import {
  friendlyLlmError,
  isTimeoutError,
  shouldFailFastLlmError,
} from "../../llm-errors.ts";
import { designTelemetryEntry } from "../../design-telemetry.ts";
import { signatureFromDesignField } from "../../design-plan-field.ts";
import { NarrationPhase } from "./narration.ts";
import {
  appendBuildSessionLogs,
  finalizeBuildSession,
  recordBuildSessionChecks,
  recordBuildSessionError,
  transitionBuildSession,
  type CanonicalBuildSession,
} from "../build-session.ts";
import {
  ensureUserMessage,
  emitTerminalUserMessage,
} from "../terminal-user-message.ts";
import type { PauseReason } from "../infra.ts";
import {
  formatBuildFeedback,
  formatTypeCheckFeedback,
  resolveValidationMode,
  touchedPathsIncludeSrc,
} from "../validation-policy.ts";
import { classifyLlmLoopRetrial } from "../retrial-policy.ts";

export type BuildExecuteDeps = {
  robinActive: boolean;
  approvedPlanBuild: boolean;
  approvedPlanSteps: PlanStep[];
  approvedPlanDesign?: DesignPlanField;
  designReadPathsDone: Set<string>;
  getApprovedPlanStepIndex: () => number;
  setApprovedPlanStepIndex: (index: number) => void;
  buildFixResume: boolean;
  originalUserRequest: string;
  projectTemplate: string;
  maxStepsLimit: number;
  state: AgentState;
  toolsUsed: Set<string>;
  fileContentCache: Map<string, string>;
  getToolMissCount: () => number;
  setToolMissCount: (count: number) => void;
  getForceToolsNext: () => boolean;
  setForceToolsNext: (value: boolean) => void;
  getToolsInvoked: () => boolean;
  setToolsInvoked: (value: boolean) => void;
  getConsecutiveNoContentReadSteps: () => number;
  setConsecutiveNoContentReadSteps: (value: number) => void;
  getReadGateBlockCount: () => number;
  setReadGateBlockCount: (count: number) => void;
  getLlmResponseWasStreamed: () => boolean;
  getLastExecutePhaseMessage: () => string | null;
  setLastExecutePhaseMessage: (value: string | null) => void;
  getBuildSession: () => CanonicalBuildSession | null;
  setBuildSession: (session: CanonicalBuildSession | null) => void;
  getDirectiveEmitted: () => boolean;
  setDirectiveEmitted: (value: boolean) => void;
  touchedPaths: Set<string>;
  executionModel: LLMProvider;
  reg: ToolRegistry;
  compression: SessionContextManager;
  observer: RuntimeObserver;
  router: ModelRouter;
  emitAgentProse: (raw: string, loopStep: number) => void;
  ensureOpeningBeforeWork: (fallback: string) => void;
  narrationPhase?: NarrationPhase;
  narrationBuffer: string;
  emit: PlanTurnEmit;
  platformLimitExceeded: () => boolean;
  pauseOperationForUser: (input: {
    reason: PauseReason;
    message: string;
    steps: number;
    toolsUsed: Set<string>;
  }) => Promise<PlanTurnRunResult>;
  runDesignPreflightIfNeeded: () =>
    Promise<{
      status: "passed" | "recoverable_fail" | "terminal_fail";
      feedback?: string;
      checks: Array<{ name: string; ok: boolean; output: string }>;
      availableComponents?: string;
    } | null>;
  requiresFinalBuildGate: () => boolean;
  enabledApprovedPlanSteps: () => PlanStep[];
  isCanceled: () => Promise<boolean>;
  touchHeartbeat: () => Promise<void>;
  maybeEmitSilenceHeartbeat: () => void;
  bumpLlmRetries: () => Promise<number>;
  resetLlmRetries: () => Promise<void>;
  saveCheckpoint: (phase: LoopPhaseEnum, force?: boolean) => Promise<void>;
  persistFinal: (summary: string, opts?: PersistFinalOpts) => Promise<void>;
  clearCheckpoint: () => Promise<void>;
  persistAssistantStep: (response: ChatResponse) => Promise<string | null>;
  updateAssistantStep: (
    msgId: string,
    response: ChatResponse,
    execResults: Array<{ call: ToolCall; result: ToolResult }>,
    step: number,
  ) => Promise<void>;
  notifyLoopStatus: (ctx: LoopUpdateContext) => void;
  recordTouchedPath: (path: string) => void;
  finishClarify: (
    message: string,
    steps: number,
    toolsUsed: string[],
    clarifyQuestions?: Array<{
      id: string;
      intro?: string;
      question: string;
      multiple?: boolean;
      choices: Array<{ id: string; label: string; description?: string }>;
    }>,
  ) => Promise<PlanTurnRunResult>;
  attemptGracefulClosing: (reason: "tool_miss" | "build_fail") => Promise<string | null>;
  emitTransition: (eventType: string, data?: unknown) => Promise<void>;
  llmChat: (
    model: LLMProvider,
    instruction: string,
    history: ChatMessage[],
    forceTools: boolean,
    tools?: ToolDefinition[],
  ) => Promise<ChatResponse | null>;
  getContextFiles: () => Array<{ path: string }>;
};

function applyNoToolCallsEnforcement(
  deps: BuildExecuteDeps,
  response: ChatResponse,
  assistantText: string,
): boolean {
  const decision = decideToolProgress({
    hasToolCalls: false,
    missCount: deps.getToolMissCount(),
    wasStreamed: deps.getLlmResponseWasStreamed(),
  });
  if (decision.kind === "fail") {
    deps.emit("error", { message: decision.userMessage, recoverable: false });
    return true;
  }
  if (decision.kind !== "retry") return false;

  deps.setToolMissCount(decision.attempt);
  deps.setForceToolsNext(decision.forceToolsNext);

  const historyContent = assistantContentForHistory(
    response.content,
    assistantText,
    deps.narrationBuffer,
    deps.getLlmResponseWasStreamed(),
  );
  if (assistantText.trim()) {
    deps.emitAgentProse(assistantText, deps.state.currentStepIndex);
  }

  deps.state.messages.push({
    role: "assistant",
    content: historyContent,
  });
  return false;
}

function needsZeroWritesProtection(deps: BuildExecuteDeps): boolean {
  return deps.approvedPlanBuild && deps.touchedPaths.size === 0;
}

function zeroDeliveryLoopBackNeeded(deps: BuildExecuteDeps): boolean {
  return shouldLoopBackForZeroDelivery({
    actionableIntent: isActionableIntent(deps.state.intent?.type),
    touchedPathsCount: deps.touchedPaths.size,
  });
}

async function pauseAtStepLimit(
  deps: BuildExecuteDeps,
  loopStep: number,
): Promise<PlanTurnRunResult | null> {
  if (loopStep < deps.maxStepsLimit) return null;
  await deps.saveCheckpoint(LoopPhaseEnum.DECIDE_NEXT, true);
  return deps.pauseOperationForUser({
    reason: "step_limit",
    message: deps.requiresFinalBuildGate()
      ? "Limite de passos atingido com build pendente — continue quando estiver pronto."
      : "Limite de passos atingido — continue quando estiver pronto.",
    steps: loopStep,
    toolsUsed: deps.toolsUsed,
  });
}

function applyZeroDeliveryLoopBack(
  deps: BuildExecuteDeps,
  loopStep: number,
  context: string,
): void {
  logger.event("agent.build_zero_delivery_loop_back", {
    context,
    loopStep,
    readOnlyBatches: deps.getConsecutiveNoContentReadSteps(),
  });
  deps.setForceToolsNext(true);
  deps.setToolMissCount(0);
  deps.state.messages.push({
    role: "user",
    content: ZERO_DELIVERY_LOOP_BACK_MESSAGE,
  });
}

function projectHasSrcTree(deps: BuildExecuteDeps): boolean {
  if (deps.getContextFiles().some((f) => f.path.replace(/^\//, "").startsWith("src/"))) {
    return true;
  }
  return touchedPathsIncludeSrc(deps.touchedPaths);
}

async function guardedTerminalExit(
  deps: BuildExecuteDeps,
  loopStep: number,
  exit: () => Promise<PlanTurnRunResult>,
): Promise<PlanTurnRunResult | null> {
  if (
    needsZeroWritesProtection(deps) &&
    deps.touchedPaths.size === 0 &&
    loopStep < deps.maxStepsLimit
  ) {
    applyZeroDeliveryLoopBack(deps, loopStep, "terminal_zero_writes");
    return null;
  }
  return exit();
}

/** Produz fechamento final garantido via choke point central — NUNCA retorna vazio. */
function forceFinalClosing(
  deps: BuildExecuteDeps,
  instruction: string,
  history: ChatMessage[],
  errorMessage?: string,
): string {
  const text = ensureUserMessage(
    history,
    [...deps.touchedPaths],
    instruction,
    errorMessage,
  );
  deps.narrationPhase?.emitFinalClosing(text);
  return text;
}

/** Wrapper de saída: garante `assistant_text` final visível antes de persistir.
 *  Usa força de fechamento que agora SEMPRE produz prosa (nunca o erro técnico "modelo não respondeu").
 *  Emite prose não-vazio + persist + retorna resultado utilizável (ok ou failed mas com user message). */
async function emitClosingAndPersist(
  deps: BuildExecuteDeps,
  loopStep: number,
  opts: {
    closing?: string | null;
    instruction?: string;
    ok?: boolean;
    error?: string;
    buildFailed?: boolean;
    canceled?: boolean;
  },
): Promise<PlanTurnRunResult> {
  const instruction = opts.instruction ?? deps.originalUserRequest;
  const history = deps.state.messages;
  const finalText = (opts.closing ?? "").trim() ||
    forceFinalClosing(deps, instruction, history, opts.error);
  const ok = opts.ok === true;
  await emitTerminalUserMessage(deps, finalText, true, ok, true, {
    buildFailed: opts.buildFailed,
  });
  const session = deps.getBuildSession();
  if (session) {
    const withError =
      !ok && opts.error
        ? recordBuildSessionError(session, {
            kind: opts.canceled ? "canceled" : opts.buildFailed ? "build" : "contract",
            message: opts.error,
            recoverable: false,
            phase: "terminal_failed",
          })
        : session;
    deps.setBuildSession(finalizeBuildSession(withError, ok ? "ok" : "failed", finalText));
  }
  return {
    ok,
    error: opts.error,
    steps: loopStep,
    resumable: false,
    canceled: opts.canceled,
    toolsUsed: [...deps.toolsUsed],
  };
}

async function emitTerminalBuildFailure(
  deps: BuildExecuteDeps,
  loopStep: number,
  message: string,
): Promise<PlanTurnRunResult> {
  const text = message.trim() || ensureUserMessage(
    deps.state.messages,
    [...deps.touchedPaths],
    deps.originalUserRequest,
    message,
  );
  await emitTerminalUserMessage(deps, text, true, false, true, { buildFailed: true });
  const session = deps.getBuildSession();
  if (session) {
    deps.setBuildSession(
      finalizeBuildSession(
        recordBuildSessionError(session, {
          kind: "build",
          message: text,
          recoverable: false,
          phase: "terminal_failed",
        }),
        "failed",
        text,
      ),
    );
  }
  return {
    ok: false,
    error: text,
    steps: loopStep,
    resumable: false,
    toolsUsed: [...deps.toolsUsed],
  };
}

function emitCanonicalPlanTasks(deps: BuildExecuteDeps): void {
  if (!deps.approvedPlanBuild || deps.approvedPlanSteps.length === 0) return;

  const total = deps.approvedPlanSteps.length;
  for (let idx = 0; idx < deps.approvedPlanSteps.length; idx += 1) {
    const step = deps.approvedPlanSteps[idx];
    const label =
      step.description?.trim() ||
      step.filePath?.trim() ||
      `Etapa ${idx + 1}/${total}`;
    const criteria =
      step.filePath?.trim() || (step.enabled === false ? "Desativada" : undefined);
    deps.emit("task", {
      id: step.id || `plan-step-${idx}`,
      label,
      criteria,
      active: idx === 0,
      done: false,
      failed: false,
    });
  }
}

export async function runBuildExecutePhase(
  deps: BuildExecuteDeps,
  initialStep: number,
): Promise<PlanTurnRunResult> {
  let buildAttempts = 0;
  let finalGateAttempts = 0;
  let loopStep = initialStep;
  let finalGateOk = false;
  let agentTextComplete = false;
  let lastValidationStep = 0;
  let llmLoopAttempts = 0;

  logger.event("agent.build_execute_entered", {
    initialStep,
    maxStepsLimit: deps.maxStepsLimit,
    approvedPlanBuild: deps.approvedPlanBuild,
    buildFixResume: deps.buildFixResume,
    runId: deps.getBuildSession()?.runId ?? undefined,
  });

  const initialSession = deps.getBuildSession();
  if (initialSession) {
    deps.setBuildSession(
      transitionBuildSession(initialSession, "sandbox_bootstrapping", {
        reason: "canonical build session started",
      }),
    );
  }

  emitCanonicalPlanTasks(deps);

  const preflight = await deps.runDesignPreflightIfNeeded();
  if (preflight) {
    const session = deps.getBuildSession();
    if (session) {
      deps.setBuildSession(recordBuildSessionChecks(session, "preflight", preflight.checks));
    }
  }
  if (preflight?.status === "terminal_fail") {
    const err = preflight.feedback?.trim() || "PREFLIGHT FALHOU";
    const session = deps.getBuildSession();
    if (session) {
      deps.setBuildSession(
        recordBuildSessionError(session, {
          kind: "environment",
          message: err,
          recoverable: false,
          phase: "terminal_failed",
        }),
      );
    }
    const preflightExit = await guardedTerminalExit(deps, loopStep, () =>
      emitClosingAndPersist(deps, loopStep, {
        closing: err,
        error: err,
        ok: false,
        buildFailed: true,
      }),
    );
    if (preflightExit !== null) return preflightExit;
  }
  if (preflight?.status === "recoverable_fail") {
    const err = preflight.feedback?.trim() || "PREFLIGHT FALHOU";
    const session = deps.getBuildSession();
    if (session) {
      deps.setBuildSession(
        recordBuildSessionError(session, {
          kind: "recoverable",
          message: err,
          recoverable: true,
          phase: "preflight_failed",
          retryDelta: 1,
        }),
      );
      deps.setBuildSession(
        appendBuildSessionLogs(deps.getBuildSession() ?? session, [err]),
      );
    }
    deps.notifyLoopStatus({ kind: "build_fix" });
    deps.state.messages.push({
      role: "user",
      content: `${err}\nCorrija o ambiente e o código com fs_edit/shell_exec antes de seguir.`,
    });
  }

  const sessionBeforeBuild = deps.getBuildSession();
  if (sessionBeforeBuild) {
    deps.setBuildSession(
      transitionBuildSession(sessionBeforeBuild, "build_running", {
        reason: "preflight complete and build execution started",
      }),
    );
  }

  let summarizeReady = false;
  while (!summarizeReady) {
    while (!finalGateOk) {
      agentTextComplete = false;
      while (loopStep < deps.maxStepsLimit) {
      if (deps.platformLimitExceeded()) {
        const prose = await resolveClosureText({
          messages: deps.state.messages,
          touchedPaths: [...deps.touchedPaths],
          userRequest: deps.originalUserRequest,
        }).catch(() => "");
        return deps.pauseOperationForUser({
          reason: "platform_limit",
          message: prose || "Limite de tempo da plataforma — continue quando estiver pronto.",
          steps: loopStep,
          toolsUsed: deps.toolsUsed,
        });
      }

      if (await deps.isCanceled()) {
        const cancelText = "Cancelado pelo usuário";
        deps.emit("canceled", { message: cancelText });
        return emitClosingAndPersist(deps, loopStep, {
          closing: cancelText,
          error: "Cancelado",
          ok: false,
          canceled: true,
        });
      }

      loopStep++;
      let timeoutRetriedThisStep = false;
      deps.state.currentStepIndex = loopStep;
      deps.state.phase = LoopPhaseEnum.EXECUTE_STEP;
      await deps.touchHeartbeat();

      logger.event("agent.build_step_start", {
        loopStep,
        approvedPlanBuild: deps.approvedPlanBuild,
        buildFixResume: deps.buildFixResume,
        maxStepsLimit: deps.maxStepsLimit,
      });

      if (deps.approvedPlanBuild) {
        const enabled = deps.enabledApprovedPlanSteps();
        deps.state.totalSteps = enabled.length;
        const stepIndex = deps.getApprovedPlanStepIndex();
        deps.emit("step", {
          current: stepIndex + 1,
          total: enabled.length,
          plan: true,
        });
        const activeStep = enabled[stepIndex];
        const stepMessage = activeStep ? activeStep.description.slice(0, 120) : "";
        if (stepMessage !== deps.getLastExecutePhaseMessage()) {
          deps.emit("phase", { phase: "execute", message: stepMessage });
          deps.setLastExecutePhaseMessage(stepMessage);
        }
      } else {
        deps.emit("phase", { phase: "execute", message: "" });
      }

      const preTurnGuide = evaluateTurnGuidePreTurn({
        consecutiveReadOnlyBatches: deps.getConsecutiveNoContentReadSteps(),
        touchedPathsCount: deps.touchedPaths.size,
      });
      if (preTurnGuide.action === "nudge_stall") {
        deps.state.messages.push({ role: "user", content: preTurnGuide.message });
      }

      deps.compression.emitUsage(deps.state.messages);

      if (deps.compression.shouldRunCompact(deps.state.messages)) {
        deps.emit("phase", { phase: "compact", message: "Compactando contexto…" });
        const designSnapshot = deps.approvedPlanDesign
          ? JSON.stringify({
              moment: deps.approvedPlanDesign.moment,
              techniques: deps.approvedPlanDesign.techniques,
              voice: deps.approvedPlanDesign.voice,
            })
          : undefined;
        const compacted = await deps.compression.runCompact(deps.state.messages, {
          mission: deps.originalUserRequest,
          designSnapshot,
        });
        deps.state.messages = compacted.messages;
        deps.compression.emitUsage(deps.state.messages);
      } else if (deps.compression.shouldInjectAdvisory(deps.state.messages)) {
        deps.state.messages.push({
          role: "system",
          content: deps.compression.buildAdvisoryMessage(),
        });
        deps.compression.markAdvisoryInjected();
      }

      const compressed = deps.compression.prepareMessages(deps.state.messages);
      const executeInstruction = buildExecuteInstruction(deps.originalUserRequest, {
        loopStep,
        buildFixResume: deps.buildFixResume,
        design: deps.approvedPlanDesign,
      });
      if (loopStep === 1 && deps.approvedPlanDesign && !deps.getDirectiveEmitted()) {
        const d = deps.approvedPlanDesign;
        const gesture = typeof d.moment === "string" ? d.moment : "(sem gesto)";
        const techniques = Array.isArray(d.techniques) ? d.techniques : [];
        deps.emit("directive", { brief: deps.originalUserRequest, gesture, techniques });
        deps.setDirectiveEmitted(true);
      }
      const actionableIntent = isActionableIntent(deps.state.intent?.type);
      const forceTools = computeForceTools({
        forceToolsNext: deps.getForceToolsNext(),
        toolsInvoked: deps.getToolsInvoked(),
        actionableIntent,
        approvedPlanBuild: deps.approvedPlanBuild,
        loopStep,
      });
      const narrationOnlyStep = computeNarrationOnlyStep({
        forceToolsNext: deps.getForceToolsNext(),
        toolsInvoked: deps.getToolsInvoked(),
        loopStep,
        actionableIntent,
        approvedPlanBuild: deps.approvedPlanBuild,
      });

      let response: ChatResponse | null = null;
      try {
        deps.maybeEmitSilenceHeartbeat();
        await deps.touchHeartbeat();
        response = await deps.llmChat(
          deps.executionModel,
          executeInstruction,
          compressed,
          forceTools,
          deps.reg.getDefinitions(),
        );
      } catch (err: unknown) {
        const friendly = friendlyLlmError(err, deps.robinActive);
        const timedOut = isTimeoutError(err);
        logger.event(timedOut ? "agent.build_llm_timeout" : "agent.build_llm_error", {
          loopStep,
          friendly,
          failFast: shouldFailFastLlmError(err),
          timedOut,
        });
        if (timedOut && !timeoutRetriedThisStep) {
          timeoutRetriedThisStep = true;
          loopStep--;
          continue;
        }
        const retrialLayer = classifyLlmLoopRetrial({
          err,
          loopAttempts: llmLoopAttempts,
          maxLoopAttempts: EXECUTE_MAX_LLM_RETRIES,
          timedOut,
          timeoutRetriedThisStep,
        });
        if (retrialLayer === "terminal") {
          const failMsg = `Erro: ${friendly}`;
          const fastExit = await guardedTerminalExit(deps, loopStep, () =>
            emitClosingAndPersist(deps, loopStep, {
              closing: failMsg,
              error: failMsg,
              ok: false,
              buildFailed: true,
            }),
          );
          if (fastExit === null) continue;
          return fastExit;
        }
        if (retrialLayer === "in_loop") {
          llmLoopAttempts++;
          await deps.bumpLlmRetries();
          deps.notifyLoopStatus({ kind: "model_error", errorDetail: friendly });
          loopStep--;
          deps.state.messages.push({
            role: "user",
            content: friendly,
          });
          continue;
        }
        const failMsg = `Erro: ${friendly}`;
        deps.notifyLoopStatus({ kind: "model_error", errorDetail: friendly });
        return deps.pauseOperationForUser({
          reason: "llm_exhausted",
          message: failMsg,
          steps: loopStep,
          toolsUsed: deps.toolsUsed,
        });
      }

      if (!response) break;

      await deps.resetLlmRetries();
      deps.compression.recordUsage(response.usage);

      logger.event("agent.build_llm_response", {
        loopStep,
        contentLength: (response.content ?? "").trim().length,
        toolCount: response.tool_calls?.length ?? 0,
        streamed: deps.getLlmResponseWasStreamed(),
        forceTools,
        narrationOnlyStep,
      });

      const assistantText = (response.content ?? "").trim();
      const hadThinkingActivity = deps.getLlmResponseWasStreamed();
      const readOnlyUpdate = updateReadOnlyTracker(
        deps.getConsecutiveNoContentReadSteps(),
        response,
        assistantText,
        hadThinkingActivity,
      );
      deps.setConsecutiveNoContentReadSteps(readOnlyUpdate.consecutive);

      if (hasMixedMetaAndExecution(response.tool_calls)) {
        deps.state.messages.push({
          role: "assistant",
          content: response.content ?? assistantText,
          tool_calls: response.tool_calls?.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });
        deps.state.messages.push({
          role: "user",
          content:
            "PARE. Não misture clarify com ferramentas de execução. Use só um tipo por turno.",
        });
        continue;
      }

      const {
        clarify: clarifyCall,
        createPlan: createPlanCall,
        declareTasks: declareTasksCall,
        sessionCompact: sessionCompactCall,
        execution: execCalls,
      } = splitMetaToolCalls(response.tool_calls ?? []);

      if (sessionCompactCall) {
        deps.toolsUsed.add("session_compact");
        deps.emit("phase", { phase: "compact", message: "Compactando contexto…" });
        const designSnapshot = deps.approvedPlanDesign
          ? JSON.stringify({
              moment: deps.approvedPlanDesign.moment,
              techniques: deps.approvedPlanDesign.techniques,
              voice: deps.approvedPlanDesign.voice,
            })
          : undefined;
        const compacted = await deps.compression.runCompact(deps.state.messages, {
          mission: deps.originalUserRequest,
          designSnapshot,
        });
        deps.state.messages = compacted.messages;
        deps.compression.emitUsage(deps.state.messages);
        deps.state.messages.push({
          role: "assistant",
          content: response.content ?? assistantText,
          tool_calls: [
            {
              id: sessionCompactCall.id,
              type: "function" as const,
              function: {
                name: sessionCompactCall.name,
                arguments: JSON.stringify(sessionCompactCall.arguments),
              },
            },
          ],
        });
        deps.state.messages.push({
          role: "tool",
          tool_call_id: sessionCompactCall.id,
          content: JSON.stringify({
            ok: true,
            beforeTokens: compacted.beforeTokens,
            afterTokens: compacted.afterTokens,
          }),
        });
        continue;
      }

      if (declareTasksCall) {
        deps.toolsUsed.add("declare_tasks");
        const rawTasks = Array.isArray(declareTasksCall.arguments.tasks)
          ? declareTasksCall.arguments.tasks
          : [];
        for (const t of rawTasks) {
          if (!t || typeof t !== "object") continue;
          const id = String((t as Record<string, unknown>).id ?? crypto.randomUUID());
          const label = String((t as Record<string, unknown>).label ?? "");
          if (!label) continue;
          const criteriaRaw = (t as Record<string, unknown>).criteria;
          deps.emit("task", {
            id,
            label,
            criteria: typeof criteriaRaw === "string" ? criteriaRaw : undefined,
            active: false,
            done: false,
            failed: false,
          });
        }
        deps.state.messages.push({
          role: "assistant",
          content: response.content ?? assistantText,
          tool_calls: [
            {
              id: declareTasksCall.id,
              type: "function" as const,
              function: {
                name: declareTasksCall.name,
                arguments: JSON.stringify(declareTasksCall.arguments),
              },
            },
          ],
        });
        deps.state.messages.push({
          role: "tool",
          tool_call_id: declareTasksCall.id,
          content: JSON.stringify({ ok: true, declared: rawTasks.length }),
        });
        // Se houver tool_calls de execução junto com declare_tasks, solte elas no próximo turno.
        if (execCalls.length > 0) {
          deps.state.messages.push({
            role: "user",
            content:
              "PARE. Não misture declare_tasks com ferramentas de execução. " +
              "Use declare_tasks sozinho primeiro; depois execute na próxima rodada.",
          });
        }
        continue;
      }

      if (createPlanCall) {
        deps.state.messages.push({
          role: "assistant",
          content: response.content ?? assistantText,
          tool_calls: response.tool_calls?.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });
        deps.state.messages.push({
          role: "user",
          content:
            "create_plan só existe no modo Plan (dropdown do composer). " +
            "Você está em modo Build — use fs_read/fs_edit/shell_exec ou responda em texto. " +
            "Se o usuário pediu um plano formal, peça para mudar o composer para Plan.",
        });
        continue;
      }

      if (clarifyCall && execCalls.length === 0) {
        deps.toolsUsed.add("clarify");
        const clarifyMsg = formatClarifyMessage(clarifyCall.arguments);
        const combined = [assistantText, clarifyMsg].filter(Boolean).join("\n\n").trim();
        const clarifyQuestions = extractClarifyQuestions(clarifyCall.arguments);
        return deps.finishClarify(combined, 0, [...deps.toolsUsed], clarifyQuestions);
      }

      if (!response.tool_calls || response.tool_calls.length === 0) {
        const blockTextOnly = shouldBlockTextOnlyCompletion({
          actionableIntent,
          touchedPathsCount: deps.touchedPaths.size,
          assistantText,
        });
        if (
          blockTextOnly ||
          shouldEnforceNoToolCalls({
            forceTools,
            narrationOnlyStep,
            llmResponseWasStreamed: deps.getLlmResponseWasStreamed(),
            approvedPlanBuild: deps.approvedPlanBuild,
            actionableIntent,
            toolsInvoked: deps.getToolsInvoked(),
            touchedPathsCount: deps.touchedPaths.size,
          })
        ) {
          const fail = applyNoToolCallsEnforcement(deps, response, assistantText);
          if (fail) {
            const closing = await deps.attemptGracefulClosing("tool_miss");
            const toolMissExit = await guardedTerminalExit(deps, loopStep, () =>
              emitClosingAndPersist(deps, loopStep, {
                closing: closing ?? TOOL_FAIL_USER_MESSAGE,
                error: closing ?? TOOL_FAIL_USER_MESSAGE,
                ok: false,
              }),
            );
            if (toolMissExit === null) continue;
            return toolMissExit;
          }
          continue;
        }
        logger.event("agent.build_step_complete", {
          loopStep,
          outcome: "text_only",
          assistantTextLength: assistantText.length,
        });
        deps.state.messages.push({
          role: "assistant",
          content: response.content ?? "",
        });
        agentTextComplete = true;
        break;
      }

      deps.setToolMissCount(0);
      deps.setForceToolsNext(false);
      deps.setToolsInvoked(true);

      if (assistantText) {
        deps.emitAgentProse(assistantText, deps.state.currentStepIndex);
      } else if (!deps.narrationPhase?.openingEmitted) {
        const opening = await attemptOpeningProse({
          messages: deps.state.messages,
          model: deps.executionModel,
          userRequest: deps.originalUserRequest,
        });
        if (opening) {
          deps.ensureOpeningBeforeWork(opening);
        }
      }

      deps.emit("phase", {
        phase: "execute",
        toolCount: response.tool_calls.length,
      });
      logger.event("agent.build_tool_batch_start", {
        loopStep,
        toolCount: response.tool_calls.length,
        toolNames: response.tool_calls.map((tc) => tc.name),
      });
      await deps.saveCheckpoint(LoopPhaseEnum.EXECUTE_STEP);

      const liveMsgId = await deps.persistAssistantStep(response);

      const readGateDecision = evaluateReadGate({
        readPaths: deps.approvedPlanDesign?.read_paths,
        readsDone: deps.designReadPathsDone,
        patchCalls: response.tool_calls,
        readGateBlockCount: deps.getReadGateBlockCount(),
      });
      if (readGateDecision.action === "read_gate_relaxed") {
        const relaxedBlockCount = deps.getReadGateBlockCount() + 1;
        for (const p of readGateDecision.missing) {
          deps.designReadPathsDone.add(normalizeDesignReadPath(p));
        }
        deps.setReadGateBlockCount(0);
        logger.event("design.read_gate_relaxed", {
          missing: readGateDecision.missing,
          blockCount: relaxedBlockCount,
        });
      } else if (readGateDecision.action === "block_read_gate") {
        deps.setReadGateBlockCount(deps.getReadGateBlockCount() + 1);
        deps.state.executionLog = appendExecutionLogEntry(
          deps.state.executionLog,
          designTelemetryEntry("read_paths_gate", false, readGateDecision.message),
        );
        deps.state.messages.push({
          role: "user",
          content: readGateDecision.message,
        });
        if (liveMsgId) {
          await deps.updateAssistantStep(liveMsgId, response, [], loopStep);
        }
        continue;
      }
      if ((deps.approvedPlanDesign?.read_paths?.length ?? 0) > 0) {
        deps.state.executionLog = appendExecutionLogEntry(
          deps.state.executionLog,
          designTelemetryEntry("read_paths_gate", true, "read_paths satisfied"),
        );
      }

      const execResults = await parallelExecute(response.tool_calls, async (call) => {
        deps.toolsUsed.add(call.name);
        const preDiff = computeFilePreDiff(call, deps.fileContentCache);

        deps.emit("tool_start", {
          name: call.name,
          args: call.arguments,
          toolCallId: call.id,
        });
        const result = await deps.reg.execute(call);
        if (result.ok) recordDesignReadPath(call, deps.designReadPathsDone);
        deps.emit("tool_done", {
          name: call.name,
          toolCallId: call.id,
          ok: result.ok,
          error: result.error,
          output:
            typeof result.output === "object"
              ? JSON.stringify(result.output).slice(0, 2000)
              : String(result.output ?? "").slice(0, 2000),
        });

        if (call.name === "shell_exec" && isBuildCommand(String(call.arguments.command ?? ""))) {
          const output =
            typeof result.output === "string"
              ? result.output
              : result.output != null
                ? JSON.stringify(result.output)
                : (result.error ?? "");
          deps.emit("build_log", {
            command: String(call.arguments.command ?? "").slice(0, 240),
            lines: output
              .split("\n")
              .map((l: string) => l.trim())
              .filter(Boolean)
              .slice(-40),
            ok: result.ok,
            output: output.slice(0, 4000),
          });
          const session = deps.getBuildSession();
          if (session) {
            deps.setBuildSession(
              appendBuildSessionLogs(session, [
                `${String(call.arguments.command ?? "").slice(0, 240)} :: ${output.slice(0, 1000)}`,
              ]),
            );
          }
        }

        if (preDiff && result.ok) {
          deps.recordTouchedPath(preDiff.path);
          deps.emit("file_diff", preDiff);
          if (
            isAndroidNativePath(preDiff.path) &&
            shouldSuggestStackFork({
              path: preDiff.path,
              projectTemplate: deps.projectTemplate,
              contextFiles: deps.getContextFiles(),
            })
          ) {
            deps.emit("stack_fork_suggested", {
              path: preDiff.path,
              suggestedStack: "android-native",
              message:
                "Detectamos código **mobile nativo** neste projeto web. Quer criar um projeto Android dedicado? (O arquivo foi mantido — nada foi apagado.)",
            });
          }
        }

        return { ...result, toolCallId: call.id };
      });

      const modifiedPaths = execResults
        .filter(({ call }) => call.name === "fs_write" || call.name === "fs_edit")
        .map(({ call }) => (call.arguments.path as string) ?? call.name)
        .filter(Boolean);
      if (modifiedPaths.length > 0) {
        const commitMsg =
          modifiedPaths.length === 1
            ? `${modifiedPaths[0]}: update`
            : `update ${modifiedPaths.length} files`;
        await deps.reg.execute({
          id: crypto.randomUUID(),
          name: "shell_exec",
          arguments: {
            command: `cd /home/user && git add -A && git commit -m "${commitMsg}" 2>&1 || true`,
          },
        });
      }

      logger.event("agent.build_tool_batch_done", {
        loopStep,
        toolCount: response.tool_calls.length,
        allOk: execResults.every(({ result }) => result.ok),
        modifiedPaths,
      });

      deps.state.messages.push({
        role: "assistant",
        content: response.content ?? "",
        tool_calls: response.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });

      for (const { call, result } of execResults) {
        deps.state.messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: buildStructuredToolContent(call, result).slice(0, 8000),
        });
      }

      deps.notifyLoopStatus({
        kind: "tool_batch",
        tools: response.tool_calls.map((tc) => ({
          name: tc.name,
          arguments: tc.arguments,
        })),
        step: loopStep,
        total: deps.maxStepsLimit,
        allOk: execResults.every(({ result }) => result.ok),
      });

      if (
        deps.approvedPlanBuild &&
        execResults.every(({ result }) => result.ok) &&
        deps.getApprovedPlanStepIndex() < deps.enabledApprovedPlanSteps().length - 1
      ) {
        deps.setApprovedPlanStepIndex(deps.getApprovedPlanStepIndex() + 1);
        const enabled = deps.enabledApprovedPlanSteps();
        deps.emit("step", {
          current: deps.getApprovedPlanStepIndex() + 1,
          total: enabled.length,
          plan: true,
        });
      }

      if (await deps.isCanceled()) {
        const cancelText = "Cancelado pelo usuário";
        deps.emit("canceled", { message: cancelText });
        return emitClosingAndPersist(deps, loopStep, {
          closing: cancelText,
          error: "Cancelado",
          ok: false,
          canceled: true,
        });
      }

      const stepHash = hashToolBatch(
        response.tool_calls
          .filter((tc) => tc.name !== "fs_write" && tc.name !== "fs_edit")
          .map((tc) => ({ name: tc.name, arguments: tc.arguments })),
      );
      deps.state.executionLog = appendExecutionLogEntry(deps.state.executionLog, stepHash);

      const modifiedFilePaths = response.tool_calls
        .filter((t) => t.name === "fs_write" || t.name === "fs_edit")
        .map((t) => t.arguments.path as string)
        .filter(Boolean);

      if (liveMsgId) {
        await deps.updateAssistantStep(liveMsgId, response, execResults, loopStep);
      }

      if (modifiedFilePaths.length > 0) {
        const typeCheck = await deps.observer.quickTypeCheck(modifiedFilePaths);
        if (!typeCheck.ok) {
          deps.notifyLoopStatus({ kind: "typecheck_fail" });
          deps.state.messages.push({
            role: "user",
            content: formatTypeCheckFeedback(typeCheck.errors),
          });
          continue;
        }
      }

      const modifiedFiles = modifiedFilePaths.length > 0;
      const validationMode = resolveValidationMode({
        touchedPaths: deps.touchedPaths,
        hasSrcTree: projectHasSrcTree(deps),
        loopStep,
        isFinalGate: false,
        lastValidationStep,
      });
      if (modifiedFiles && buildAttempts < EXECUTE_MAX_RETRIES && validationMode === "light") {
        deps.emit("phase", { phase: "validate", message: "Conferindo tipos…" });
        const lightObservation = await deps.observer.observeLight(() => deps.platformLimitExceeded());
        lastValidationStep = loopStep;
        if (!lightObservation.passed) {
          buildAttempts++;
          deps.state.messages.push({
            role: "user",
            content: formatBuildFeedback(lightObservation.feedback, lightObservation.checks),
          });
          continue;
        }
        buildAttempts = 0;
      }

      if (isExecutionStuck(deps.state.executionLog)) {
        deps.state.messages.push({
          role: "user",
          content: "PARE. Repetindo mesmas ferramentas. Mude de abordagem.",
        });
      }

      await deps.saveCheckpoint(LoopPhaseEnum.DECIDE_NEXT);
    }

      if (loopStep >= deps.maxStepsLimit && !agentTextComplete) {
        await deps.saveCheckpoint(LoopPhaseEnum.DECIDE_NEXT, true);
        return deps.pauseOperationForUser({
          reason: "step_limit",
          message: deps.requiresFinalBuildGate()
            ? "Limite de passos atingido com build pendente — continue quando estiver pronto."
            : "Limite de passos atingido — continue quando estiver pronto.",
          steps: loopStep,
          toolsUsed: deps.toolsUsed,
        });
      }

    if (!deps.requiresFinalBuildGate()) {
      if (zeroDeliveryLoopBackNeeded(deps)) {
        const stepPause = await pauseAtStepLimit(deps, loopStep);
        if (stepPause) return stepPause;
        applyZeroDeliveryLoopBack(deps, loopStep, "pre_gate_zero_delivery");
        continue;
      }
      finalGateOk = true;
      continue;
    }

    const finalValidationMode = resolveValidationMode({
      touchedPaths: deps.touchedPaths,
      hasSrcTree: projectHasSrcTree(deps),
      loopStep,
      isFinalGate: true,
      lastValidationStep,
    });
    if (finalValidationMode === "off") {
      finalGateOk = true;
      continue;
    }

    deps.state.phase = LoopPhaseEnum.VALIDATE_STEP;
    deps.emit("phase", { phase: "observe", message: "" });
    const session = deps.getBuildSession();
    if (session) {
      deps.setBuildSession(
        transitionBuildSession(session, "validate_running", {
          reason: "final gate validation running",
        }),
      );
    }
    await deps.saveCheckpoint(LoopPhaseEnum.VALIDATE_STEP);
    const finalObservation = await deps.observer.observe(() => deps.platformLimitExceeded());
    lastValidationStep = loopStep;
    const sessionAfterFinalObserve = deps.getBuildSession();
    if (sessionAfterFinalObserve) {
      deps.setBuildSession(
        recordBuildSessionChecks(sessionAfterFinalObserve, "validate", finalObservation.checks),
      );
    }
    if (finalObservation.passed) {
      deps.notifyLoopStatus({ kind: "build_ok" });
      logger.event("agent.build_final_gate_passed", {
        loopStep,
        finalGateAttempts,
      });
      const passingSession = deps.getBuildSession();
      if (passingSession) {
        deps.setBuildSession(
          transitionBuildSession(passingSession, "build_running", {
            reason: "final gate passed",
          }),
        );
      }
      finalGateOk = true;
      continue;
    }

    finalGateAttempts++;
    const failedSession = deps.getBuildSession();
    if (failedSession) {
      deps.setBuildSession(
        recordBuildSessionError(failedSession, {
          kind: "build",
          message: finalObservation.feedback?.slice(0, 500) ?? "final gate failed",
          recoverable: finalGateAttempts <= EXECUTE_MAX_RETRIES,
          phase: "validate_running",
          retryDelta: 1,
        }),
      );
    }

    if (finalGateAttempts > EXECUTE_MAX_RETRIES) {
      const failMsg =
        `Build não passou após ${EXECUTE_MAX_RETRIES} tentativas.\n\n` +
        `${finalObservation.feedback?.slice(0, 2000) ?? "Erros de compilação no sandbox."}\n` +
        "Vou manter a sessão viva para nova correção.";
      logger.event("agent.build_final_gate_failed_terminal", {
        loopStep,
        finalGateAttempts,
        feedbackLength: (finalObservation.feedback ?? "").length,
      });
      deps.notifyLoopStatus({ kind: "build_fix" });
      const gateExit = await guardedTerminalExit(deps, loopStep, () =>
        emitTerminalBuildFailure(deps, loopStep, failMsg),
      );
      if (gateExit === null) continue;
      return gateExit;
    }

    if (deps.platformLimitExceeded()) {
      return deps.pauseOperationForUser({
        reason: "platform_limit",
        message: "Limite de tempo da plataforma com build pendente — continue quando estiver pronto.",
        steps: loopStep,
        toolsUsed: deps.toolsUsed,
      });
    }

    deps.state.messages.push({
      role: "user",
      content: formatBuildFeedback(finalObservation.feedback, finalObservation.checks),
    });
    deps.notifyLoopStatus({ kind: "build_fix" });
    }

    if (zeroDeliveryLoopBackNeeded(deps)) {
      const stepPause = await pauseAtStepLimit(deps, loopStep);
      if (stepPause) return stepPause;
      applyZeroDeliveryLoopBack(deps, loopStep, "pre_summarize_zero_delivery");
      finalGateOk = false;
      continue;
    }

    summarizeReady = true;
  }

  deps.state.phase = LoopPhaseEnum.SUMMARIZE;
  await deps.emitTransition("delivered");
  deps.emit("phase", { phase: "summarize", message: "" });
  await deps.saveCheckpoint(LoopPhaseEnum.SUMMARIZE, true);
  const closingText = sanitizeUserFacingProse(
    await resolveClosureText({
      messages: deps.state.messages,
      touchedPaths: [...deps.touchedPaths],
      userRequest: deps.originalUserRequest ?? undefined,
      model: deps.executionModel,
    }),
  );

  // Inviolabilidade garantida pelo resolveClosureText + forceFinalClosing: sempre prosa não-vazia.
  // Nunca mais o erro "O modelo não respondeu com a mensagem esperada".
  let finalClosing = (closingText || "").trim();
  if (!finalClosing) {
    finalClosing = forceFinalClosing(deps, deps.originalUserRequest, deps.state.messages);
  }
  deps.emit("assistant_text", {
    text: finalClosing,
    append: false,
    final: true,
  });
  const terminalSession = deps.getBuildSession();
  if (terminalSession) {
    deps.setBuildSession(finalizeBuildSession(terminalSession, "ok", finalClosing));
  }
  try {
    await deps.persistFinal(finalClosing, {
      lastFinishOk: true,
      designSignature: deps.approvedPlanDesign
        ? (signatureFromDesignField(deps.approvedPlanDesign) as Record<string, unknown>)
        : undefined,
    });
  } catch (e) {
    console.error("[loop] persistFinal failed", e);
  }
  try {
    await deps.clearCheckpoint();
  } catch (e) {
    console.error("[loop] clearCheckpoint failed", e);
  }

  const tokens = deps.compression.getTotalTokens();
  const costUsd = deps.compression.getEstimatedCostUsd(deps.router.mainCfg.model);
  deps.emit("done", {
    summary: finalClosing.slice(0, 2000),
    totalInputTokens: tokens.input,
    totalOutputTokens: tokens.output,
    totalTokens: tokens.total,
    costUsd,
  });
  return {
    ok: true,
    summary: finalClosing.slice(0, 2000),
    steps: loopStep,
    toolsUsed: [...deps.toolsUsed],
    totalInputTokens: tokens.input,
    totalOutputTokens: tokens.output,
    totalTokens: tokens.total,
    costUsd,
  };
}
