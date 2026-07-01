// runtime/phases/execute.ts — Loop principal de build/execute (Fase 2.2)
import { CompressionManager, parallelExecute } from "../../compression.ts";
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
  assertDesignReadsDone,
  buildStructuredToolContent,
  computeFilePreDiff,
  computeForceTools,
  computeNarrationOnlyStep,
  EXECUTE_MAX_LLM_RETRIES,
  EXECUTE_MAX_RETRIES,
  isActionableIntent,
  isUiPatchCall,
  recordDesignReadPath,
  shouldEnforceNoToolCalls,
  shouldSuggestStackFork,
  updateReadOnlyTracker,
} from "./execute-helpers.ts";
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  DesignPlanField,
  LLMProvider,
  PlanStep,
  ToolCall,
  ToolResult,
} from "../../types.ts";
import type { ToolRegistry } from "../../registry.ts";
import type { PersistFinalOpts } from "./persist.ts";
import { LoopPhase as LoopPhaseEnum } from "../../types.ts";
import type { LoopUpdateContext } from "../../loop-status.ts";
import { friendlyLlmError, shouldFailFastLlmError } from "../../llm-errors.ts";
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
  getLlmResponseWasStreamed: () => boolean;
  getLastExecutePhaseMessage: () => string | null;
  setLastExecutePhaseMessage: (value: string | null) => void;
  getBuildSession: () => CanonicalBuildSession | null;
  setBuildSession: (session: CanonicalBuildSession | null) => void;
  touchedPaths: Set<string>;
  executionModel: LLMProvider;
  reg: ToolRegistry;
  compression: CompressionManager;
  observer: RuntimeObserver;
  router: ModelRouter;
  emitAgentProse: (raw: string, loopStep: number) => void;
  ensureOpeningBeforeWork: (fallback: string) => void;
  narrationPhase?: NarrationPhase;
  narrationBuffer: string;
  emit: PlanTurnEmit;
  loopBudgetExceeded: () => boolean;
  returnResumableChunk: (
    steps: number,
    toolsUsed: Set<string>,
    options?: { buildFix?: boolean },
  ) => Promise<PlanTurnRunResult>;
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
    deps.emit("explore", { message: decision.exploreMessage });
    deps.emit("error", { message: decision.userMessage, recoverable: false });
    return true;
  }
  if (decision.kind !== "retry") return false;

  deps.setToolMissCount(decision.attempt);
  deps.setForceToolsNext(decision.forceToolsNext);
  deps.emit("explore", { message: decision.exploreMessage });

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

const CLOSING_SYSTEM_PROMPT =
  "Você deve terminar esta interação com uma frase curta para o usuário (máximo 200 caracteres) explicando o resultado real: o que conseguiu, o que falhou, ou por que parou. Não invente sucesso. Seja específico.";

/** Produz fechamento final garantido. Prefere prosa anterior / síntese; NUNCA retorna vazio.
 *  Determinístico + history-derived fallback assegura prose visível para o usuário. */
async function forceFinalClosing(
  deps: BuildExecuteDeps,
  instruction: string,
  history: ChatMessage[],
): Promise<string> {
  // Reutiliza o resolvedor de fechamento que agora GARANTE não-vazio.
  try {
    const resolved = await resolveClosureText({
      messages: history,
      touchedPaths: [...(deps.touchedPaths ?? [])],
      userRequest: instruction,
      model: deps.executionModel,
    });
    if (resolved && resolved.trim()) {
      deps.narrationPhase?.emitFinalClosing(resolved);
      return resolved;
    }
  } catch {}
  // Ultra-safe deterministic prose.
  const touched = [...(deps.touchedPaths ?? [])];
  const base = instruction ? instruction.slice(0, 80) : "o pedido";
  const note = touched.length ? ` (${touched.length} arquivos)` : "";
  return `Trabalho finalizado para ${base}${note}. Sessão disponível para próximos ajustes.`;
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
  let finalText = (opts.closing ?? "").trim();
  if (!finalText) {
    finalText = await forceFinalClosing(deps, instruction, history);
  }
  // Garantia absoluta: se algo bizarro deixou vazio, usa fallback ultra-seguro.
  if (!finalText || !finalText.trim()) {
    finalText = "Trabalho finalizado. Sessão disponível para revisão ou continuação.";
  }
  // Sempre emitimos prose visível para o usuário (nunca o erro "não respondeu").
  deps.emit("assistant_text", { text: finalText, final: true, append: false });
  const ok = opts.ok === true;
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
  await deps.persistFinal(finalText, {
    lastFinishOk: ok,
    buildFailed: opts.buildFailed,
  });
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
  const text = message.trim() || "Retomando em seguida.";
  deps.emit("assistant_text", { text, final: true, append: false });
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
  await deps.persistFinal(text, {
    lastFinishOk: false,
    buildFailed: true,
  });
  return {
    ok: false,
    error: text,
    steps: loopStep,
    resumable: false,
    toolsUsed: [...deps.toolsUsed],
  };
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
    return emitClosingAndPersist(deps, loopStep, {
      closing: err,
      error: err,
      ok: false,
      buildFailed: true,
    });
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

  while (!finalGateOk) {
    agentTextComplete = false;
    while (loopStep < deps.maxStepsLimit) {
      if (deps.loopBudgetExceeded()) {
        // Guarantee prose emission even on budget yield (AC1).
        const prose = await resolveClosureText({ messages: deps.state.messages, touchedPaths: [...deps.touchedPaths], userRequest: deps.originalUserRequest }).catch(() => "Retomando o trabalho...");
        if (prose?.trim()) deps.emit("assistant_text", { text: prose, final: false, append: false });
        return deps.returnResumableChunk(loopStep, deps.toolsUsed);
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
        deps.state.totalSteps = deps.maxStepsLimit;
        deps.emit("step", { current: loopStep, total: deps.maxStepsLimit });
        deps.emit("phase", { phase: "execute", message: "" });
      }

      const compressed = await deps.compression.compress(deps.state.messages);
      const executeInstruction = buildExecuteInstruction(deps.originalUserRequest, {
        loopStep,
        buildFixResume: deps.buildFixResume,
        design: deps.approvedPlanDesign,
      });
      // Serializa o directive pro inspector (ACT III do simulacro) -- so no 1o passo do build.
      if (loopStep === 1 && deps.approvedPlanDesign) {
        const d = deps.approvedPlanDesign;
        const gesture = typeof d.moment === "string" ? d.moment : "(sem gesto)";
        const techniques = Array.isArray(d.techniques) ? d.techniques : [];
        deps.emit("directive", { brief: deps.originalUserRequest, gesture, techniques });
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
        );
      } catch (err: unknown) {
        const friendly = friendlyLlmError(err, deps.robinActive);
        logger.event("agent.build_llm_error", {
          loopStep,
          friendly,
          failFast: shouldFailFastLlmError(err),
        });
        if (shouldFailFastLlmError(err)) {
          const failMsg = `Erro: ${friendly}`;
          return emitClosingAndPersist(deps, loopStep, {
            closing: failMsg,
            error: failMsg,
            ok: false,
            buildFailed: true,
          });
        }
        const retries = await deps.bumpLlmRetries();
        if (retries >= EXECUTE_MAX_LLM_RETRIES) {
          const failMsg = `Erro: ${friendly}`;
          return emitClosingAndPersist(deps, loopStep, {
            closing: failMsg,
            error: failMsg,
            ok: false,
            buildFailed: true,
          });
        }
        await deps.saveCheckpoint(LoopPhaseEnum.ERROR, true);
        deps.notifyLoopStatus({ kind: "model_error", errorDetail: friendly });
        const prose = await resolveClosureText({ messages: deps.state.messages, touchedPaths: [...deps.touchedPaths], userRequest: deps.originalUserRequest }).catch(() => "Erro temporário no modelo — retomando...");
        if (prose?.trim()) deps.emit("assistant_text", { text: prose, final: false, append: false });
        return deps.returnResumableChunk(loopStep, deps.toolsUsed);
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
      const readOnlyUpdate = updateReadOnlyTracker(
        deps.getConsecutiveNoContentReadSteps(),
        response,
        assistantText,
      );
      deps.setConsecutiveNoContentReadSteps(readOnlyUpdate.consecutive);

      if (readOnlyUpdate.shouldHardStop) {
        deps.emit("stuck", {
          message:
            `Modelo preso em leitura por ${readOnlyUpdate.consecutive} passos sem produzir output`,
        });
        deps.notifyLoopStatus({ kind: "stuck" });
        return emitTerminalBuildFailure(
          deps,
          loopStep,
          "Modelo sem resposta. Vou retomar com correção no próximo chunk.",
        );
      }

      if (readOnlyUpdate.shouldNudge) {
        deps.emit("stuck", { message: "" });
        deps.state.messages.push({
          role: "user",
          content: "PARE. Lendo sem produzir. Use fs_write ou fs_edit agora.",
        });
      }

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
        execution: execCalls,
      } = splitMetaToolCalls(response.tool_calls ?? []);

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
        if (
          shouldEnforceNoToolCalls({
            forceTools,
            narrationOnlyStep,
            llmResponseWasStreamed: deps.getLlmResponseWasStreamed(),
            approvedPlanBuild: deps.approvedPlanBuild,
            actionableIntent,
            toolsInvoked: deps.getToolsInvoked(),
          })
        ) {
          const fail = applyNoToolCallsEnforcement(deps, response, assistantText);
          if (fail) {
            const closing = await deps.attemptGracefulClosing("tool_miss");
            return emitClosingAndPersist(deps, loopStep, {
              closing: closing ?? TOOL_FAIL_USER_MESSAGE,
              error: closing ?? TOOL_FAIL_USER_MESSAGE,
              ok: false,
            });
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

      const readGate = assertDesignReadsDone({
        readPaths: deps.approvedPlanDesign?.read_paths,
        readsDone: deps.designReadPathsDone,
        patchCalls: response.tool_calls,
      });
      if (!readGate.ok) {
        deps.state.executionLog = appendExecutionLogEntry(
          deps.state.executionLog,
          designTelemetryEntry("read_paths_gate", false, readGate.message),
        );
        deps.state.messages.push({
          role: "user",
          content: readGate.message,
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

        if ((call.name === "fs_write" || call.name === "fs_edit") && result.ok) {
          const pathArg = (call.arguments.path as string) ?? call.name;
          deps.emit("preview_sync", { path: pathArg, reason: "fs_change" });
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
        deps.emit("preview_sync", {
          path: modifiedPaths[0],
          reason: "fs_success",
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
          deps.emit("typecheck_fail", {
            errors: typeCheck.errors,
            files: modifiedFilePaths,
          });
          deps.state.messages.push({
            role: "user",
            content: `BUILD FALHOU:\n${typeCheck.errors
              .map((e) => `${e.file}:${e.line} - ${e.message}`)
              .join("\n")}\nCorrija com fs_edit.`,
          });
          continue;
        }
      }

      const modifiedFiles = modifiedFilePaths.length > 0;
      if (modifiedFiles && buildAttempts < EXECUTE_MAX_RETRIES) {
        deps.state.phase = LoopPhaseEnum.VALIDATE_STEP;
        deps.notifyLoopStatus({ kind: "build_check" });
        deps.emit("phase", { phase: "observe", message: "" });
        const session = deps.getBuildSession();
        if (session) {
          deps.setBuildSession(
            transitionBuildSession(session, "validate_running", {
              reason: "post-build validation running",
            }),
          );
        }
        await deps.saveCheckpoint(LoopPhaseEnum.VALIDATE_STEP);
        const observation = await deps.observer.observe(() => deps.loopBudgetExceeded());
        const sessionAfterObserve = deps.getBuildSession();
        if (sessionAfterObserve) {
          deps.setBuildSession(
            recordBuildSessionChecks(sessionAfterObserve, "validate", observation.checks),
          );
        }
        if (!observation.passed) {
          buildAttempts++;
          const failedMessage = observation.feedback?.slice(0, 500) ?? "validate failed";
          logger.event("agent.build_validate_retry", {
            loopStep,
            attempt: buildAttempts,
            checks: observation.checks.filter((c) => !c.ok).map((c) => c.name),
            feedbackLength: (observation.feedback ?? "").length,
          });
          const failingSession = deps.getBuildSession();
          if (failingSession) {
            deps.setBuildSession(
              recordBuildSessionError(failingSession, {
                kind: "build",
                message: failedMessage,
                recoverable: true,
                phase: "validate_running",
                retryDelta: 1,
              }),
            );
          }
          deps.emit("validate_fail", {
            attempt: buildAttempts,
            checks: observation.checks.filter((c) => !c.ok).map((c) => c.name),
            feedback: observation.feedback?.slice(0, 500),
          });
          deps.state.messages.push({
            role: "user",
            content: `BUILD FALHOU:\n${observation.feedback?.slice(0, 2000) ?? ""}\nCorrija com fs_edit.`,
          });
          continue;
        }
        buildAttempts = 0;
        deps.notifyLoopStatus({ kind: "build_ok" });
        deps.emit("validate_ok", { message: "Build OK" });
        logger.event("agent.build_validate_passed", {
          loopStep,
          modifiedFiles,
        });
        const passedSession = deps.getBuildSession();
        if (passedSession) {
          deps.setBuildSession(
            transitionBuildSession(passedSession, "build_running", {
              reason: "validation passed",
            }),
          );
        }
      }

      if (isExecutionStuck(deps.state.executionLog)) {
        deps.notifyLoopStatus({ kind: "stuck" });
        deps.emit("stuck", { message: "" });
        deps.state.messages.push({
          role: "user",
          content: "PARE. Repetindo mesmas ferramentas. Mude de abordagem.",
        });
      }

      await deps.saveCheckpoint(LoopPhaseEnum.DECIDE_NEXT);
    }

    if (loopStep >= deps.maxStepsLimit && !agentTextComplete) {
      await deps.saveCheckpoint(LoopPhaseEnum.DECIDE_NEXT, true);
      const prose = await resolveClosureText({ messages: deps.state.messages, touchedPaths: [...deps.touchedPaths], userRequest: deps.originalUserRequest }).catch(() => "Limite de passos atingido — retomando para continuar.");
      if (prose?.trim()) deps.emit("assistant_text", { text: prose, final: false, append: false });
      return deps.returnResumableChunk(loopStep, deps.toolsUsed, {
        buildFix: deps.requiresFinalBuildGate(),
      });
    }

    if (!deps.requiresFinalBuildGate()) {
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
    const finalObservation = await deps.observer.observe(() => deps.loopBudgetExceeded());
    const sessionAfterFinalObserve = deps.getBuildSession();
    if (sessionAfterFinalObserve) {
      deps.setBuildSession(
        recordBuildSessionChecks(sessionAfterFinalObserve, "validate", finalObservation.checks),
      );
    }
    if (finalObservation.passed) {
      deps.notifyLoopStatus({ kind: "build_ok" });
      deps.emit("validate_ok", { message: "Build OK (gate final)" });
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
    deps.emit("validate_fail", {
      attempt: finalGateAttempts,
      checks: finalObservation.checks.filter((c) => !c.ok).map((c) => c.name),
      feedback: finalObservation.feedback?.slice(0, 500),
      finalGate: true,
    });

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
      return emitTerminalBuildFailure(deps, loopStep, failMsg);
    }

    if (deps.loopBudgetExceeded()) {
      const prose = await resolveClosureText({ messages: deps.state.messages, touchedPaths: [...deps.touchedPaths], userRequest: deps.originalUserRequest }).catch(() => "Orçamento de loop excedido — retomando...");
      if (prose?.trim()) deps.emit("assistant_text", { text: prose, final: false, append: false });
      return deps.returnResumableChunk(loopStep, deps.toolsUsed, { buildFix: true });
    }

    deps.state.messages.push({
      role: "user",
      content:
        `BUILD FALHOU:\n${finalObservation.feedback?.slice(0, 2000) ?? ""}\nCorrija com fs_edit.`,
    });
    deps.notifyLoopStatus({ kind: "build_fix" });
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
    finalClosing = await forceFinalClosing(deps, deps.originalUserRequest, deps.state.messages);
  }
  if (!finalClosing || !finalClosing.trim()) {
    finalClosing = "Trabalho concluído com sucesso. Ajustes adicionais podem ser solicitados.";
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
