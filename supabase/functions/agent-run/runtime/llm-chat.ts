// runtime/llm-chat.ts — LLM chat do modo build (Fase 2.2)
import { buildForgeAgentSystemInput } from "../agent-system-input.ts";
import { friendlyLlmError } from "../llm-errors.ts";
import { ANTI_LEAK_RULE } from "../run-context.ts";
import { mergeExecutionToolDefinitions } from "../tools/meta.ts";
import { logger } from "../../_shared/logger.ts";
import { calculateMaxTokens, THINKING_STREAM_CAP_MS } from "./loop-config.ts";
import type { PlanTurnEmit } from "./phases/plan-turn.ts";
import type {
  AgentContext,
  ChatMessage,
  ChatResponse,
  LLMProvider,
  ToolDefinition,
} from "../types.ts";

export type BuildLlmStreamState = {
  llmResponseWasStreamed: boolean;
  thinkingStreamStartedAt: number | null;
};

export function buildBuildContextBlock(context: AgentContext | null): string {
  return context
    ? `## Contexto do Projeto\n${context.projectConfig}\n\n## Arquivos\n${context.manifest}`
    : "(projeto novo)";
}

export function buildBuildAgentSystemPrompt(input: {
  projectTemplate: string;
  stackAddon: string;
  sessionAddon: string;
  tasteStart: boolean;
  skillPrompt: string;
}): string {
  return buildForgeAgentSystemInput({
    planMode: false,
    projectTemplate: input.projectTemplate,
    stackAddon: input.stackAddon,
    skillPrompt: input.skillPrompt,
    sessionAddon: input.sessionAddon,
    antiLeakRule: ANTI_LEAK_RULE,
    tasteStart: input.tasteStart,
  });
}

export function createBuildModeTokenHandler(
  streamState: BuildLlmStreamState,
  emit: PlanTurnEmit,
  onActivity: () => void,
  onThinkingCapExceeded: () => void,
): (delta: string) => void {
  return (delta: string) => {
    if (!delta) return;
    if (streamState.thinkingStreamStartedAt == null) {
      streamState.thinkingStreamStartedAt = Date.now();
    }
    const elapsed = Date.now() - streamState.thinkingStreamStartedAt;
    if (elapsed > THINKING_STREAM_CAP_MS) {
      onThinkingCapExceeded();
      return;
    }
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

export async function chatBuildModeLlm(input: {
  model: LLMProvider;
  instruction: string;
  history: ChatMessage[];
  contextBlock: string;
  fullSystemPrompt: string;
  toolDefinitions: ToolDefinition[];
  complexityScore: number;
  forceTools: boolean;
  tools?: ToolDefinition[];
  streamState: BuildLlmStreamState;
  emit: PlanTurnEmit;
  onActivity: () => void;
  onThinkingCapExceeded: () => void;
  runId: string | null;
  robinActive: boolean;
}): Promise<ChatResponse> {
  const messages: ChatMessage[] = [
    { role: "system", content: input.fullSystemPrompt },
    { role: "system", content: input.contextBlock },
    ...input.history,
    { role: "user", content: input.instruction },
  ];

  input.streamState.llmResponseWasStreamed = false;
  input.streamState.thinkingStreamStartedAt = null;

  const buildModeStartedAt = Date.now();
  try {
    const response = await input.model.chat({
      messages,
      tools: input.tools ?? mergeExecutionToolDefinitions(input.toolDefinitions, false),
      tool_choice: input.forceTools ? "required" : "auto",
      max_tokens: calculateMaxTokens(input.complexityScore as 1 | 2 | 3 | 4 | 5),
      onTokenDelta: input.forceTools
        ? undefined
        : createBuildModeTokenHandler(
          input.streamState,
          input.emit,
          input.onActivity,
          input.onThinkingCapExceeded,
        ),
    });

    logger.info("agent.build_llm_response", {
      runId: input.runId ?? undefined,
      durationMs: Date.now() - buildModeStartedAt,
      hasContent: typeof response.content === "string" && response.content.trim().length > 0,
      contentLength: typeof response.content === "string" ? response.content.length : 0,
      contentPreview:
        typeof response.content === "string" ? response.content.slice(0, 200) : null,
      toolCallCount: response.tool_calls?.length ?? 0,
      toolCallNames: (response.tool_calls ?? []).map((tc) => tc.name).join(",") || null,
      streamed: input.streamState.llmResponseWasStreamed,
      forceTools: input.forceTools,
    });
    return response;
  } catch (err: unknown) {
    logger.error("agent.build_llm_call_failed", {
      runId: input.runId ?? undefined,
      durationMs: Date.now() - buildModeStartedAt,
      forceTools: input.forceTools,
      errorMessage: (err as Error)?.message,
      errorName: (err as Error)?.name,
    });
    const message = friendlyLlmError(err, input.robinActive);
    input.emit("error", { message, recoverable: true });
    throw new Error(message);
  }
}