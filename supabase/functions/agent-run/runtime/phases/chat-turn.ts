// chat-turn.ts — Turno único do modo Chat (run + SSE, sem tools)
import { friendlyLlmError } from "../../llm-errors.ts";
import { splitUserFacingChatReply } from "../../sanitize-prose.ts";
import { logger } from "../../../_shared/logger.ts";
import { calculateMaxTokens } from "../loop-config.ts";
import { DIRECT_CHAT_SYSTEM } from "../../conversational.ts";
import {
  type PlanModeStreamState,
  type PlanTurnEmit,
  type PlanTurnFinishDeps,
  type PlanTurnRunResult,
} from "./plan-turn.ts";
import type { ChatMessage, LLMProvider } from "../../types.ts";

export type ChatTurnDeps = PlanTurnFinishDeps & {
  robinActive: boolean;
  originalUserRequest: string;
  messages: ChatMessage[];
  streamState: PlanModeStreamState;
  emit: PlanTurnEmit;
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
  onActivity: () => void;
};

function buildChatUserPrompt(originalUserRequest: string, messages: ChatMessage[]): string {
  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-16)
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return `${m.role}: ${content.slice(0, 900)}`;
    })
    .join("\n");

  return [
    `Mensagem atual do usuário:\n${originalUserRequest.trim() || "(mensagem de chat)"}`,
    `Histórico recente:\n${recent || "(primeira mensagem)"}`,
  ].join("\n\n");
}

async function returnRecoverableChatChunk(
  deps: ChatTurnDeps,
  summary: string,
  error?: string,
): Promise<PlanTurnRunResult> {
  const message = summary.trim() || "Erro no modo Chat.";
  const err = (error ?? message).trim() || message;
  // Use wrapper (or fallback) to centralize prose+persistFinal for AC1.
  const chunk = await (deps as any).returnResumableWithUserMessage?.(0, new Set<string>(), undefined, message) || await deps.returnResumableChunk(0, new Set<string>());
  return { ...chunk, summary: message, error: err };
}

function createSilentChatProgressHandler(
  streamState: PlanModeStreamState,
  onActivity: () => void,
): (delta: string) => void {
  return (delta: string) => {
    if (!delta) return;
    streamState.llmResponseWasStreamed = true;
    if (streamState.thinkingStreamStartedAt == null) {
      streamState.thinkingStreamStartedAt = Date.now();
    }
    onActivity();
  };
}

export async function runChatModeAgentTurn(
  deps: ChatTurnDeps,
  model: LLMProvider,
): Promise<PlanTurnRunResult> {
  deps.emit("phase", { phase: "chat", message: "" });

  const userPrompt = buildChatUserPrompt(deps.originalUserRequest, deps.messages);
  deps.streamState.llmResponseWasStreamed = false;
  deps.streamState.thinkingStreamStartedAt = null;

  const startedAt = Date.now();
  let responseContent = "";
  try {
    const response = await model.chat({
      messages: [
        { role: "system", content: DIRECT_CHAT_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      max_tokens: calculateMaxTokens(2),
      temperature: 0.35,
      onTokenDelta: createSilentChatProgressHandler(deps.streamState, deps.onActivity),
    });
    responseContent = (response.content ?? "").trim();
  } catch (err: unknown) {
    logger.error("agent.chat_llm_call_failed", {
      runId: deps.runId ?? undefined,
      durationMs: Date.now() - startedAt,
      errorMessage: (err as Error)?.message,
    });
    const message = friendlyLlmError(err, deps.robinActive);
    return await returnRecoverableChatChunk(deps, message, message);
  }

  logger.info("agent.chat_llm_response", {
    runId: deps.runId ?? undefined,
    durationMs: Date.now() - startedAt,
    streamed: deps.streamState.llmResponseWasStreamed,
    contentLength: responseContent.length,
  });

  const { userText, reasoningText } = splitUserFacingChatReply(responseContent);
  const text = userText.trim();
  if (!text) {
    if (deps.streamState.llmResponseWasStreamed) {
      return await returnRecoverableChatChunk(
        deps,
        "O modelo respondeu sem texto final. Reformule ou troque o modelo.",
        "chat_stream_empty",
      );
    }
    return await returnRecoverableChatChunk(
      deps,
      "Resposta vazia do modelo.",
      "chat_empty_response",
    );
  }

  if (reasoningText?.trim()) {
    deps.emit("thinking_text", {
      text: reasoningText.trim(),
      append: false,
      delta: false,
      final: true,
    });
  }
  deps.emit("assistant_text", { text, final: true });
  await deps.persistFinal(text, { lastFinishOk: true, conversational: true });
  await deps.clearCheckpoint();
  deps.emit("done", { summary: text, conversational: true });

  return {
    ok: true,
    summary: text,
    steps: 0,
    toolsUsed: [],
  };
}
