// runtime/phases/execute.ts — Loop principal de build/execute (Fase 2.2)
import { CompressionManager, parallelExecute } from "../../compression.ts";
import type { RuntimeObserver } from "../../observer.ts";
import type { ModelRouter } from "../../router.ts";
import { buildExecuteInstruction } from "../../run-context.ts";
import { appendExecutionLogEntry } from "../../executionLogMeta.ts";
import { hashToolBatch, isExecutionStuck } from "../../../_shared/agent-stuck.ts";
import {
  assistantContentForHistory,
  decideToolProgress,
  TOOL_FAIL_USER_MESSAGE,
} from "../../tool-progress.ts";
import { sanitizeUserFacingProse } from "../../sanitize-prose.ts";
import { resolveClosureText } from "../../loop-status.ts";
import {
  formatClarifyMessage,
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
  shouldEnforceNoToolCalls,
  shouldSuggestStackFork,
  updateReadOnlyTracker,
} from "./execute-helpers.ts";
import type {
  AgentState,
  ChatMessage,
  ChatResponse,
  LLMProvider,
  PlanStep,
  ToolCall,
  ToolRegistry,
  ToolResult,
} from "../../types.ts";
import { LoopPhase as LoopPhaseEnum } from "../../types.ts";
import type { LoopUpdateContext } from "../../loop-status.ts";
import { BUILD_OPENING_FALLBACK, CLOSING_FALLBACK } from "../phase-messages.ts";

export type BuildExecuteDeps = {
  approvedPlanBuild: boolean;
  approvedPlanSteps: PlanStep[];
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
  touchedPaths: Set<string>;
  executionModel: LLMProvider;
  reg: ToolRegistry;
  compression: CompressionManager;
  observer: RuntimeObserver;
  router: ModelRouter;
  emitAgentProse: (raw: string, loopStep: number) => void;
  ensureOpeningBeforeWork: (fallback: string) => void;
  narrationBuffer: string;
  emit: PlanTurnEmit;
  loopBudgetExceeded: () => boolean;
  returnResumableChunk: (
    steps: number,
    toolsUsed: Set<string>,
    options?: { buildFix?: boolean },
  ) => Promise<PlanTurnRunResult>;
  runDesignPreflightIfNeeded: () => Promise<void>;
  requiresFinalBuildGate: () => boolean;
  enabledApprovedPlanSteps: () => PlanStep[];
  isCanceled: () => Promise<boolean>;
  touchHeartbeat: () => Promise<void>;
  maybeEmitSilenceHeartbeat: () => void;
  bumpLlmRetries: () => Promise<number>;
  resetLlmRetries: () => Promise<void>;
  saveCheckpoint: (phase: LoopPhaseEnum, force?: boolean) => Promise<void>;
  persistFinal: (
    summary: string,
    opts?: {
      lastFinishOk?: boolean;
      buildFailed?: boolean;
      awaiting?: boolean;
      awaitingKind?: "clarify" | "plan_approval" | null;
      conversational?: boolean;
    },
  ) => Promise<void>;
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

export async function runBuildExecutePhase(
  deps: BuildExecuteDeps,
  initialStep: number,
): Promise<PlanTurnRunResult> {
  await deps.runDesignPreflightIfNeeded();

  let buildAttempts = 0;
  let finalGateAttempts = 0;
  let loopStep = initialStep;
  let finalGateOk = false;

  while (!finalGateOk) {
    while (loopStep < deps.maxStepsLimit) {
      if (deps.loopBudgetExceeded()) {
        return deps.returnResumableChunk(loopStep, deps.toolsUsed);
      }

      if (await deps.isCanceled()) {
        await deps.persistFinal("Cancelado pelo usuário");
        deps.emit("canceled", { message: "Cancelado pelo usuário" });
        return {
          ok: false,
          error: "Cancelado",
          steps: Math.max(0, loopStep),
          canceled: true,
          toolsUsed: [...deps.toolsUsed],
        };
      }

      loopStep++;
      deps.state.currentStepIndex = loopStep;
      deps.state.phase = LoopPhaseEnum.EXECUTE_STEP;
      await deps.touchHeartbeat();

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
      });
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
        const message = err instanceof Error ? err.message : "Erro no modelo";
        const retries = await deps.bumpLlmRetries();
        if (retries >= EXECUTE_MAX_LLM_RETRIES) {
          const failMsg = `Erro: ${message}`;
          await deps.persistFinal(failMsg, {
            lastFinishOk: false,
            buildFailed: true,
          });
          return {
            ok: false,
            error: failMsg,
            steps: loopStep,
            resumable: false,
            toolsUsed: [...deps.toolsUsed],
          };
        }
        await deps.saveCheckpoint(LoopPhaseEnum.ERROR, true);
        deps.notifyLoopStatus({ kind: "model_error", errorDetail: message });
        return deps.returnResumableChunk(loopStep, deps.toolsUsed);
      }

      if (!response) break;

      await deps.resetLlmRetries();
      deps.compression.recordUsage(response.usage);

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
        await deps.persistFinal("Modelo sem resposta. Troque o modelo ou envie de novo.", {
          lastFinishOk: false,
          buildFailed: true,
        });
        return {
          ok: false,
          error: "Modelo sem resposta. Troque o modelo ou envie de novo.",
          steps: loopStep,
          resumable: false,
          toolsUsed: [...deps.toolsUsed],
        };
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
        execution: execCalls,
      } = splitMetaToolCalls(response.tool_calls ?? []);

      if (createPlanCall) {
        return {
          ok: false,
          error: "create_plan só é válido em modo Plan.",
          summary: "create_plan só é válido em modo Plan.",
          steps: loopStep,
          toolsUsed: [...deps.toolsUsed, "create_plan"],
        };
      }

      if (clarifyCall && execCalls.length === 0) {
        deps.toolsUsed.add("clarify");
        const clarifyMsg = formatClarifyMessage(clarifyCall.arguments);
        const combined = [assistantText, clarifyMsg].filter(Boolean).join("\n\n").trim();
        return deps.finishClarify(combined, 0, [...deps.toolsUsed]);
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
            const msg = closing ?? TOOL_FAIL_USER_MESSAGE;
            await deps.persistFinal(msg, { lastFinishOk: false });
            return {
              ok: false,
              error: msg,
              steps: loopStep,
              resumable: false,
              toolsUsed: [...deps.toolsUsed],
            };
          }
          continue;
        }
        deps.state.messages.push({
          role: "assistant",
          content: response.content ?? "Concluído.",
        });
        break;
      }

      deps.setToolMissCount(0);
      deps.setForceToolsNext(false);
      deps.setToolsInvoked(true);

      if (assistantText) {
        deps.emitAgentProse(assistantText, deps.state.currentStepIndex);
      } else if (loopStep === 1 && !deps.buildFixResume) {
        deps.ensureOpeningBeforeWork(BUILD_OPENING_FALLBACK);
      }

      deps.emit("phase", {
        phase: "execute",
        toolCount: response.tool_calls.length,
      });
      await deps.saveCheckpoint(LoopPhaseEnum.EXECUTE_STEP);

      const liveMsgId = await deps.persistAssistantStep(response);

      const execResults = await parallelExecute(response.tool_calls, async (call) => {
        deps.toolsUsed.add(call.name);
        const preDiff = computeFilePreDiff(call, deps.fileContentCache);

        deps.emit("tool_start", {
          name: call.name,
          args: call.arguments,
          toolCallId: call.id,
        });
        const result = await deps.reg.execute(call);
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
              .map((l) => l.trim())
              .filter(Boolean)
              .slice(-40),
            ok: result.ok,
            output: output.slice(0, 4000),
          });
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
        return result;
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
        await deps.persistFinal("Cancelado pelo usuário");
        deps.emit("canceled", { message: "Cancelado pelo usuário" });
        return {
          ok: false,
          error: "Cancelado",
          steps: Math.max(0, loopStep),
          canceled: true,
          toolsUsed: [...deps.toolsUsed],
        };
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
        await deps.saveCheckpoint(LoopPhaseEnum.VALIDATE_STEP);
        const observation = await deps.observer.observe(() => deps.loopBudgetExceeded());
        if (!observation.passed) {
          buildAttempts++;
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

    if (loopStep >= deps.maxStepsLimit) {
      await deps.saveCheckpoint(LoopPhaseEnum.DECIDE_NEXT, true);
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
    await deps.saveCheckpoint(LoopPhaseEnum.VALIDATE_STEP);
    const finalObservation = await deps.observer.observe(() => deps.loopBudgetExceeded());
    if (finalObservation.passed) {
      deps.notifyLoopStatus({ kind: "build_ok" });
      deps.emit("validate_ok", { message: "Build OK (gate final)" });
      finalGateOk = true;
      continue;
    }

    finalGateAttempts++;
    deps.emit("validate_fail", {
      attempt: finalGateAttempts,
      checks: finalObservation.checks.filter((c) => !c.ok).map((c) => c.name),
      feedback: finalObservation.feedback?.slice(0, 500),
      finalGate: true,
    });

    if (finalGateAttempts > EXECUTE_MAX_RETRIES) {
      const closing = await deps.attemptGracefulClosing("build_fail");
      const failMsg =
        `Build não passou após ${EXECUTE_MAX_RETRIES} tentativas.\n\n` +
        `${finalObservation.feedback?.slice(0, 2000) ?? "Erros de compilação no sandbox."}`;
      const msg = closing ?? failMsg;
      await deps.persistFinal(msg, {
        lastFinishOk: false,
        buildFailed: true,
      });
      return {
        ok: false,
        error: msg,
        steps: loopStep,
        resumable: false,
        toolsUsed: [...deps.toolsUsed],
      };
    }

    if (deps.loopBudgetExceeded()) {
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
    resolveClosureText({
      messages: deps.state.messages,
      touchedPaths: [...deps.touchedPaths],
      userRequest: deps.originalUserRequest ?? undefined,
    }),
  );

  const finalClosing = closingText.trim() || CLOSING_FALLBACK;
  deps.emit("assistant_text", {
    text: finalClosing,
    append: false,
    final: true,
  });
  try {
    await deps.persistFinal(finalClosing, { lastFinishOk: true });
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