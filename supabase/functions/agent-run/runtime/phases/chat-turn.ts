// chat-turn.ts — Turno único do modo Chat (run + SSE, sem tools)
import { friendlyLlmError } from "../../llm-errors.ts";
import { sanitizeUserFacingProse } from "../../sanitize-prose.ts";
import { logger } from "../../../_shared/logger.ts";
import { calculateMaxTokens } from "../loop-config.ts";
import { DIRECT_CHAT_SYSTEM } from "../../conversational.ts";
import {
  createChatModeTokenHandler,
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

async function finishChatFailure(
  deps: PlanTurnFinishDeps,
  summary: string,
  error?: string,
): Promise<PlanTurnRunResult> {
  const message = summary.trim() || "Erro no modo Chat.";
  const err = (error ?? message).trim() || message;
  deps.emit("assistant_text", { text: message, final: true });
  await deps.persistFinal(message, { lastFinishOk: false });
  await deps.clearCheckpoint();
  return {
    ok: false,
    summary: message,
    steps: 0,
    toolsUsed: [],
    error: err,
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
      onTokenDelta: createChatModeTokenHandler(deps.streamState, deps.emit, deps.onActivity),
    });
    responseContent = (response.content ?? "").trim();
  } catch (err: unknown) {
    logger.error("agent.chat_llm_call_failed", {
      runId: deps.runId ?? undefined,
      durationMs: Date.now() - startedAt,
      errorMessage: (err as Error)?.message,
    });
    const message = friendlyLlmError(err, deps.robinActive);
    return await finishChatFailure(deps, message, message);
  }

  logger.info("agent.chat_llm_response", {
    runId: deps.runId ?? undefined,
    durationMs: Date.now() - startedAt,
    streamed: deps.streamState.llmResponseWasStreamed,
    contentLength: responseContent.length,
  });

  const text = sanitizeUserFacingProse(responseContent).trim();
  if (!text) {
    if (deps.streamState.llmResponseWasStreamed) {
      return await finishChatFailure(
        deps,
        "O modelo respondeu sem texto final. Reformule ou troque o modelo.",
        "chat_stream_empty",
      );
    }
    return await finishChatFailure(deps, "Resposta vazia do modelo.", "chat_empty_response");
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