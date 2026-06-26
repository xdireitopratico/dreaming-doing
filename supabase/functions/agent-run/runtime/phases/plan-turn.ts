// runtime/phases/plan-turn.ts — Turno completo do modo Plan (Fase 2.2)
import { parallelExecute } from "../../compression.ts";
import { buildForgeAgentSystemInput } from "../../agent-system-input.ts";
import { friendlyLlmError } from "../../llm-errors.ts";
import { generatePlanChatMessage, buildPlanModeTurnInstruction } from "../../plan-mode.ts";
import { isPlanShapedMarkdown, planToolArgsFromMarkdown } from "../../plan-markdown-parse.ts";
import { sanitizeUserFacingProse } from "../../sanitize-prose.ts";
import {
  formatClarifyMessage,
  extractClarifyQuestions,
  getMetaToolDefinitions,
  hasMixedMetaAndExecution,
  isPlanModePatchTool,
  mergePlanModeToolDefinitions,
  proposedPlanFromToolArgs,
  splitMetaToolCalls,
} from "../../tools/meta.ts";
import { ANTI_LEAK_RULE } from "../../run-context.ts";
import { logger } from "../../../_shared/logger.ts";
import { calculateMaxTokens, THINKING_STREAM_CAP_MS } from "../loop-config.ts";
import type {
  AgentContext,
  AgentState,
  ChatMessage,
  ChatResponse,
  IntentAnalysis,
  LLMProvider,
  ProposedPlan,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "../../types.ts";
import { LoopPhase } from "../../types.ts";
import { PLAN_OPENING_FALLBACK } from "../phase-messages.ts";
import { enrichProposedPlanDesign } from "../../plan-design-enrich.ts";

export const MAX_PLAN_EXPLORE = 10;

export type PlanTurnRunResult = {
  ok: boolean;
  summary?: string;
  error?: string;
  steps: number;
  resumable?: boolean;
  buildFix?: boolean;
  canceled?: boolean;
  toolsUsed?: string[];
  awaiting?: boolean;
  awaitingUser?: Record<string, unknown>;
  plan?: ProposedPlan;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export type PlanTurnEmit = (type: string, data: unknown) => void;

export type PlanTurnFinishDeps = {
  runId: string | null;
  projectId: string;
  llmResponseWasStreamed: boolean;
  emit: PlanTurnEmit;
  configuredModel: () => LLMProvider;
  persistFinal: (
    summary: string,
    opts?: {
      lastFinishOk?: boolean;
      awaiting?: boolean;
      awaitingKind?: "clarify" | "plan_approval" | null;
      conversational?: boolean;
      clarifyQuestions?: Array<{
        id: string;
        intro?: string;
        question: string;
        multiple?: boolean;
        choices: Array<{ id: string; label: string; description?: string }>;
      }>;
    },
  ) => Promise<void>;
  persistPlanFinal: (summary: string, plan: ProposedPlan) => Promise<void>;
  clearCheckpoint: () => Promise<void>;
  emitTransition: (eventType: string, data?: unknown) => Promise<void>;
};

export async function finishPlanModeFailure(
  deps: PlanTurnFinishDeps,
  summary: string,
  steps: number,
  toolsUsed: readonly string[],
  error?: string,
): Promise<{
  ok: false;
  summary: string;
  steps: number;
  toolsUsed: string[];
  error: string;
}> {
  const message = summary.trim() || "Erro no modo Plan.";
  const err = (error ?? message).trim() || message;
  logger.error("agent.plan_mode_failure", {
    runId: deps.runId ?? undefined,
    step: steps,
    tools: toolsUsed.join(","),
    streamed: deps.llmResponseWasStreamed,
    error: err,
    message,
  });
  deps.emit("assistant_text", { text: message, final: true });
  await deps.persistFinal(message, { lastFinishOk: false });
  await deps.clearCheckpoint();
  return {
    ok: false,
    summary: message,
    steps,
    toolsUsed: [...toolsUsed],
    error: err,
  };
}

export async function finishPlanProposal(
  deps: PlanTurnFinishDeps,
  proposedPlan: ProposedPlan,
  toolsUsed: string[] = [],
): Promise<PlanTurnRunResult> {
  const planChatText = await generatePlanChatMessage(deps.configuredModel(), proposedPlan);
  if (!planChatText) {
    return {
      ok: false,
      summary: "Não foi possível gerar a mensagem do plano.",
      steps: 0,
      toolsUsed: [],
    };
  }
  deps.emit("assistant_text", { text: planChatText, final: true });
  deps.emit("plan_proposed", {
    planId: proposedPlan.planId,
    summary: proposedPlan.summary,
    rationale: proposedPlan.rationale,
    markdown: proposedPlan.markdown,
    mission: proposedPlan.mission,
    objective: proposedPlan.objective,
    steps: proposedPlan.steps,
    runId: deps.runId,
    projectId: deps.projectId,
    design: proposedPlan.design,
    ttlMs: proposedPlan.ttlMs,
    proposedAt: proposedPlan.proposedAt ?? new Date().toISOString(),
  });
  logger.event("agent_run.plan_proposed", {
    runId: deps.runId ?? undefined,
    planId: proposedPlan.planId,
    stepCount: proposedPlan.steps.length,
  });
  await deps.emitTransition("plan_proposed", proposedPlan);
  await deps.persistPlanFinal(planChatText, proposedPlan);
  await deps.clearCheckpoint();
  deps.emit("done", {
    summary: proposedPlan.summary,
    plan: proposedPlan,
    planProposed: true,
    awaiting: true,
  });
  return {
    ok: true,
    summary: proposedPlan.summary,
    steps: 0,
    toolsUsed,
    awaiting: true,
    awaitingUser: { type: "plan_approval", planId: proposedPlan.planId },
    plan: proposedPlan,
  };
}

export async function finishClarify(
  deps: PlanTurnFinishDeps,
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
): Promise<PlanTurnRunResult> {
  const text = message.trim();
  if (!text) {
    return {
      ok: false,
      summary: "Não foi possível gerar a pergunta de esclarecimento.",
      steps,
      toolsUsed,
    };
  }
  deps.emit("assistant_text", { text, final: true });
  deps.emit("gate_decision", {
    phase: "clarify",
    reason: "clarify tool",
    awaiting: true,
    clarifyQuestions: clarifyQuestions ?? undefined,
  });
  await deps.persistFinal(text, {
    awaiting: true,
    awaitingKind: "clarify",
    clarifyQuestions: clarifyQuestions ?? undefined,
  });
  await deps.clearCheckpoint();
  deps.emit("done", { summary: text, qualified: true, awaiting: true });
  return {
    ok: true,
    summary: text,
    steps,
    toolsUsed,
    awaiting: true,
    awaitingUser: { type: "clarify", message: text.slice(0, 200) },
  };
}

export type PlanModeStreamState = {
  llmResponseWasStreamed: boolean;
  thinkingStreamStartedAt: number | null;
};

export function buildPlanModeSystemPrompt(input: {
  projectTemplate: string;
  stackAddon: string;
  sessionAddon: string;
  tasteStart: boolean;
  skillPrompt: string;
}): string {
  return buildForgeAgentSystemInput({
    planMode: true,
    projectTemplate: input.projectTemplate,
    stackAddon: input.stackAddon,
    skillPrompt: input.skillPrompt,
    sessionAddon: input.sessionAddon,
    antiLeakRule: ANTI_LEAK_RULE,
    tasteStart: input.tasteStart,
  });
}

export function buildPlanModeContextBlock(context: AgentContext | null): string {
  return context
    ? `## Contexto do Projeto\n${context.projectConfig}\n\n## Arquivos\n${context.manifest}`
    : "(projeto novo)";
}

export function createPlanModeTokenHandler(
  streamState: PlanModeStreamState,
  emit: PlanTurnEmit,
  onActivity: () => void,
): (delta: string) => void {
  return (delta: string) => {
    if (!delta) return;
    if (streamState.thinkingStreamStartedAt == null) {
      streamState.thinkingStreamStartedAt = Date.now();
    }
    const elapsed = Date.now() - streamState.thinkingStreamStartedAt;
    if (elapsed > THINKING_STREAM_CAP_MS) return;
    streamState.llmResponseWasStreamed = true;
    onActivity();
    emit("assistant_text", {
      text: delta,
      append: true,
      delta: true,
      final: false,
      thinking: true,
    });
    emit("thinking_text", {
      text: delta,
      append: true,
      delta: true,
      final: false,
    });
  };
}

/** Reasoning real do modelo (reasoning_content) -> thinking_text -> THOUGHT no inspector. Aditivo. */
export function createPlanModeReasoningHandler(
  emit: PlanTurnEmit,
  onActivity: () => void,
): (delta: string) => void {
  return (delta: string) => {
    if (!delta) return;
    onActivity();
    emit("thinking_text", { text: delta, append: true, delta: true, final: false });
  };
}

/** Modo Chat — tokens visíveis no bubble (não timeline de thinking). */
export function createChatModeTokenHandler(
  streamState: PlanModeStreamState,
  emit: PlanTurnEmit,
  onActivity: () => void,
): (delta: string) => void {
  return (delta: string) => {
    if (!delta) return;
    streamState.llmResponseWasStreamed = true;
    onActivity();
    emit("assistant_text", {
      text: delta,
      append: true,
      delta: true,
      final: false,
    });
  };
}

export async function chatPlanModeLlm(input: {
  model: LLMProvider;
  instruction: string;
  history: ChatMessage[];
  contextBlock: string;
  fullSystemPrompt: string;
  toolDefinitions: ToolDefinition[];
  complexityScore: number;
  streamState: PlanModeStreamState;
  emit: PlanTurnEmit;
  onActivity: () => void;
}): Promise<ChatResponse | null> {
  input.streamState.llmResponseWasStreamed = false;
  input.streamState.thinkingStreamStartedAt = null;

  return input.model.chat({
    messages: [
      { role: "system", content: input.fullSystemPrompt },
      { role: "system", content: input.contextBlock },
      ...input.history,
      { role: "user", content: input.instruction },
    ],
    tools: mergePlanModeToolDefinitions(input.toolDefinitions),
    tool_choice: "auto",
    max_tokens: calculateMaxTokens(input.complexityScore as 1 | 2 | 3 | 4 | 5),
    onTokenDelta: createPlanModeTokenHandler(input.streamState, input.emit, input.onActivity),
    onReasoningDelta: createPlanModeReasoningHandler(input.emit, input.onActivity),
  });
}

export type PlanNoToolsResolution =
  | { kind: "proposal"; plan: ProposedPlan }
  | { kind: "conversational"; text: string }
  | { kind: "stream_empty" }
  | { kind: "graceful_close" }
  | { kind: "invalid_markdown" }
  | { kind: "hard_failure"; message: string; error: string };

export function resolvePlanModeNoToolsResponse(input: {
  assistantText: string;
  llmResponseWasStreamed: boolean;
}): PlanNoToolsResolution {
  const assistantText = input.assistantText.trim();
  if (assistantText) {
    if (isPlanShapedMarkdown(assistantText)) {
      const toolArgs = planToolArgsFromMarkdown(assistantText);
      const proposed = toolArgs ? proposedPlanFromToolArgs(toolArgs) : null;
      if (proposed) return { kind: "proposal", plan: proposed };
      return { kind: "invalid_markdown" };
    }
    return { kind: "conversational", text: sanitizeUserFacingProse(assistantText) };
  }
  if (input.llmResponseWasStreamed) return { kind: "stream_empty" };
  return { kind: "graceful_close" };
}

export type PlanTurnDeps = PlanTurnFinishDeps & {
  robinActive: boolean;
  originalUserRequest: string;
  state: AgentState;
  context: AgentContext | null;
  intent: IntentAnalysis | null;
  complexityScore: number;
  projectTemplate: string;
  stackAddon: string;
  sessionAddon: string;
  tasteStart: boolean;
  skillPrompt: string;
  toolDefinitions: ToolDefinition[];
  streamState: PlanModeStreamState;
  compressMessages: (messages: ChatMessage[]) => Promise<ChatMessage[]>;
  loopBudgetExceeded: () => boolean;
  returnResumableChunk: (
    steps: number,
    toolsUsed: Set<string>,
  ) => Promise<{
    ok: false;
    error: string;
    steps: number;
    resumable: true;
    buildFix?: boolean;
    toolsUsed: string[];
  }>;
  saveCheckpoint: (phase: LoopPhase) => Promise<void>;
  attemptGracefulClosing: (reason: "plan_stuck") => Promise<string | null>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
  markToolsInvoked: () => void;
  onActivity: () => void;
  ensureOpeningBeforeWork: (fallback: string) => void;
  getLlmResponseWasStreamed: () => boolean;
  setLlmResponseWasStreamed: (value: boolean) => void;
};

export async function runPlanModeAgentTurn(
  deps: PlanTurnDeps,
  model: LLMProvider,
): Promise<PlanTurnRunResult> {
  const toolsUsed = new Set<string>();
  const finishDeps: PlanTurnFinishDeps = {
    runId: deps.runId,
    projectId: deps.projectId,
    llmResponseWasStreamed: deps.getLlmResponseWasStreamed(),
    emit: deps.emit,
    configuredModel: deps.configuredModel,
    persistFinal: deps.persistFinal,
    persistPlanFinal: deps.persistPlanFinal,
    clearCheckpoint: deps.clearCheckpoint,
    emitTransition: deps.emitTransition,
  };

  deps.emit("phase", {
    phase: "plan",
    message: "",
    intent: deps.intent ?? undefined,
  });
  await deps.saveCheckpoint(LoopPhase.PLAN_MODE);

  const contextBlock = buildPlanModeContextBlock(deps.context);
  const fullSystemPrompt = buildPlanModeSystemPrompt({
    projectTemplate: deps.projectTemplate,
    stackAddon: deps.stackAddon,
    sessionAddon: deps.sessionAddon,
    tasteStart: deps.tasteStart,
    skillPrompt: deps.skillPrompt,
  });

  for (let step = 0; step < MAX_PLAN_EXPLORE; step++) {
    if (deps.loopBudgetExceeded()) {
      const chunk = await deps.returnResumableChunk(step, toolsUsed);
      return {
        ok: false,
        resumable: true,
        summary: chunk.error,
        steps: chunk.steps,
        toolsUsed: chunk.toolsUsed,
        error: chunk.error,
        buildFix: chunk.buildFix,
      };
    }

    const compressed = await deps.compressMessages(deps.state.messages);
    const instruction = step === 0
      ? buildPlanModeTurnInstruction(deps.originalUserRequest ?? "")
      : "Continue explorando ou proponha o plano.";

    const planModeStartedAt = Date.now();
    let response: ChatResponse | null = null;
    try {
      response = await chatPlanModeLlm({
        model,
        instruction,
        history: compressed,
        contextBlock,
        fullSystemPrompt,
        toolDefinitions: deps.toolDefinitions,
        complexityScore: deps.complexityScore,
        streamState: deps.streamState,
        emit: deps.emit,
        onActivity: deps.onActivity,
      });
    } catch (err: unknown) {
      logger.error("agent.plan_llm_call_failed", {
        runId: deps.runId ?? undefined,
        step,
        durationMs: Date.now() - planModeStartedAt,
        errorMessage: (err as Error)?.message,
        errorName: (err as Error)?.name,
      });
      const message = friendlyLlmError(err, deps.robinActive);
      finishDeps.llmResponseWasStreamed = deps.getLlmResponseWasStreamed();
      return await finishPlanModeFailure(finishDeps, message, step, [...toolsUsed], message);
    }

    deps.setLlmResponseWasStreamed(deps.streamState.llmResponseWasStreamed);
    finishDeps.llmResponseWasStreamed = deps.getLlmResponseWasStreamed();

    if (!response) {
      return await finishPlanModeFailure(
        finishDeps,
        "Sem resposta do modelo.",
        step,
        [...toolsUsed],
        "Sem resposta do modelo.",
      );
    }

    logger.info("agent.plan_llm_response", {
      runId: deps.runId ?? undefined,
      step,
      durationMs: Date.now() - planModeStartedAt,
      hasContent: typeof response.content === "string" && response.content.trim().length > 0,
      contentLength: typeof response.content === "string" ? response.content.length : 0,
      contentPreview:
        typeof response.content === "string" ? response.content.slice(0, 200) : null,
      toolCallCount: response.tool_calls?.length ?? 0,
      toolCallNames: (response.tool_calls ?? []).map((tc) => tc.name).join(",") || null,
      streamed: deps.getLlmResponseWasStreamed(),
    });

    const assistantText = (response.content ?? "").trim();

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
          "PARE. Não misture clarify com ferramentas de exploração. Use só um tipo por turno.",
      });
      continue;
    }

    const {
      clarify: clarifyCall,
      createPlan: planCall,
      execution: execCalls,
    } = splitMetaToolCalls(response.tool_calls ?? []);

    if (planCall) {
      toolsUsed.add("create_plan");
      deps.emit("phase", { phase: "creating_plan", message: "" });
      const proposed = proposedPlanFromToolArgs(planCall.arguments);
      if (!proposed) {
        // Guard-rail de loop: create_plan malformado (LLM fraco) NÃO é falha terminal — corrige e re-tenta.
        // O loop `for (step < MAX_PLAN_EXPLORE)` borna as tentativas; qualquer LLM erra, o loop corrige.
        deps.state.messages.push({
          role: "user",
          content:
            "Seu create_plan está incompleto — faltam `summary` (string) e/ou `steps` (array de {title, file_path, description}). " +
            "Reenvie um create_plan válido com AMBOS os campos preenchidos. Não use outras ferramentas antes disso.",
        });
        continue;
      }
      const enriched = enrichProposedPlanDesign(
        proposed,
        deps.originalUserRequest || proposed.summary,
        deps.projectTemplate,
        deps.emit,
      );
      return await finishPlanProposal(finishDeps, enriched, [...toolsUsed]);
    }

    if (clarifyCall && execCalls.length === 0) {
      toolsUsed.add("clarify");
      const clarifyMsg = formatClarifyMessage(clarifyCall.arguments);
      const combined = [assistantText, clarifyMsg].filter(Boolean).join("\n\n").trim();
      const clarifyQuestions = extractClarifyQuestions(clarifyCall.arguments);
      return await finishClarify(finishDeps, combined, step, [...toolsUsed], clarifyQuestions);
    }

    if (!response.tool_calls?.length) {
      const resolution = resolvePlanModeNoToolsResponse({
        assistantText,
        llmResponseWasStreamed: deps.getLlmResponseWasStreamed(),
      });

      if (resolution.kind === "proposal") {
        deps.emit("phase", { phase: "creating_plan", message: "" });
        return await finishPlanProposal(finishDeps, resolution.plan, [...toolsUsed]);
      }
      if (resolution.kind === "conversational" && resolution.text) {
        deps.emit("assistant_text", { text: resolution.text, final: true });
        await deps.persistFinal(resolution.text, { lastFinishOk: true, conversational: true });
        await deps.clearCheckpoint();
        deps.emit("done", { summary: resolution.text, conversational: true });
        return { ok: true, summary: resolution.text, steps: step, toolsUsed: [...toolsUsed] };
      }
      if (resolution.kind === "invalid_markdown") {
        return await finishPlanModeFailure(
          finishDeps,
          "Plano no chat inválido — use create_plan com 2–7 passos.",
          step,
          [...toolsUsed],
          "plan_markdown_invalid",
        );
      }
      if (resolution.kind === "stream_empty") {
        return await finishPlanModeFailure(
          finishDeps,
          "O modelo respondeu sem texto nem ferramentas. Reformule o pedido do plano.",
          step,
          [...toolsUsed],
          "plan_stream_empty",
        );
      }
      if (resolution.kind === "graceful_close") {
        logger.warn("agent.plan_empty_response", {
          runId: deps.runId ?? undefined,
          step,
          streamed: deps.getLlmResponseWasStreamed(),
          contentType: typeof response.content,
          contentIsNull: response.content === null,
          contentIsEmptyString: response.content === "",
          contentLength: typeof response.content === "string" ? response.content.length : 0,
          toolCallCount: response.tool_calls?.length ?? 0,
          assistantText: assistantText.slice(0, 200),
        });
      }
      // ponytail: stale = fechamento honesto (o que fez + pendente), nunca "modelo não completou".
      const staleClosing = await deps.attemptGracefulClosing("plan_stuck");
      if (staleClosing) {
        return { ok: true, summary: staleClosing, steps: step, toolsUsed: [...toolsUsed] };
      }
      let done: string;
      if (toolsUsed.size !== 0) {
        const list = [...toolsUsed].slice(0, 5).join(", ");
        done = `Parei aqui — usei ${toolsUsed.size} ferramenta(s): ${list}. Não consegui sintetizar a resposta final agora; retome para continuar.`;
      } else {
        done = "Não consegui sintetizar a resposta final agora. Reformule o pedido ou retome o agente.";
      }
      return await finishPlanModeFailure(finishDeps, done, step, [...toolsUsed], "plan_stale_close");
    }

    const patchCalls = execCalls.filter((c) => isPlanModePatchTool(c.name));
    if (patchCalls.length > 0) {
      deps.state.messages.push({
        role: "assistant",
        content: response.content ?? assistantText,
        tool_calls: response.tool_calls!.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });
      deps.state.messages.push({
        role: "user",
        content:
          "Modo Plan: fs_write, fs_edit e fs_delete estão bloqueados. " +
          "Use fs_read, fs_search, fs_list ou shell_exec (grep, cat, ls) para explorar.",
      });
      continue;
    }

    deps.markToolsInvoked();
    deps.ensureOpeningBeforeWork(assistantText || PLAN_OPENING_FALLBACK);
    deps.emit("phase", { phase: "plan", message: "", toolCount: execCalls.length });

    const execResults = await parallelExecute(execCalls, async (call) => {
      toolsUsed.add(call.name);
      deps.emit("tool_start", {
        name: call.name,
        args: call.arguments,
        toolCallId: call.id,
      });
      const result = await deps.executeTool(call);
      deps.emit("tool_done", {
        name: call.name,
        toolCallId: call.id,
        ok: result.ok,
        error: result.error,
        summary: result.ok ? "ok" : (result.error ?? "erro"),
      });
      return result;
    });

    deps.state.messages.push({
      role: "assistant",
      content: response.content ?? assistantText,
      tool_calls: execCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    for (const { call, result } of execResults) {
      deps.state.messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
  }

  const closing = await deps.attemptGracefulClosing("plan_stuck");
  if (closing) {
    return { ok: true, summary: closing, steps: MAX_PLAN_EXPLORE, toolsUsed: [...toolsUsed] };
  }
  return await finishPlanModeFailure(
    finishDeps,
    "Limite de exploração no modo Plan — tente create_plan ou clarify.",
    MAX_PLAN_EXPLORE,
    [...toolsUsed],
    "plan_explore_limit",
  );
}

export async function attemptPlanStuckClosing(input: {
  messages: ChatMessage[];
  model: LLMProvider;
  finishProposal: (plan: ProposedPlan) => Promise<void>;
}): Promise<string | null> {
  const nudge =
    "Você explorou o suficiente mas não conseguiu finalizar o plano. " +
    "Use create_plan para propor o plano baseado no que já explorou, " +
    "ou se não for possível, explique ao usuário o que encontrou " +
    "e pergunte se pode continuar na próxima sessão.";

  input.messages.push({ role: "user", content: nudge });

  try {
    const response = await input.model.chat({
      messages: input.messages,
      tool_choice: "auto",
      tools: getMetaToolDefinitions(true),
      max_tokens: 1024,
      temperature: 0.7,
    });

    if (response.tool_calls?.length) {
      const { createPlan } = splitMetaToolCalls(response.tool_calls);
      if (createPlan) {
        const proposed = proposedPlanFromToolArgs(createPlan.arguments);
        if (proposed) {
          await input.finishProposal(proposed);
          return proposed.summary;
        }
      }
    }

    const text = (response.content ?? "").trim();
    if (!text) return null;
    return sanitizeUserFacingProse(text);
  } catch {
    return null;
  }
}