import type { AgentComposerMode } from "@/lib/chat-types";
import type { ForgeSessionKind } from "@/lib/taste";
import { buildOutgoingParts, type StoredMessagePart } from "@/lib/chat-attachments";
import { isExplicitBuildRequest, resolveTurnIntent, type AgentRunMode } from "@/lib/turn-intent";

export type SendMessageInput = {
  text: string;
  mode?: AgentComposerMode;
  parts?: StoredMessagePart[];
  composerMode: AgentComposerMode;
  conversationId: string;
  projectId: string;
  kind: ForgeSessionKind;
  agentBusy: boolean;
  planAwaiting: boolean;
};

export type SendMessageDeps = {
  insertUserMessage: (
    conversationId: string,
    parts: StoredMessagePart[],
    meta: Record<string, unknown>,
  ) => Promise<{ error: string | null }>;
  queueMessage: (
    projectId: string,
    conversationId: string,
    kind: ForgeSessionKind,
    mode: AgentRunMode,
  ) => Promise<{ ok: boolean; message?: string }>;
  runAgent: (kind: ForgeSessionKind, mode: AgentRunMode) => Promise<boolean>;
  beginPendingTurn: () => void;
  clearPendingTurn: () => void;
  onInserted?: () => void;
  onQueued?: (message: string) => void;
  onError?: (message: string) => void;
  onRunFailed?: () => void;
};

function messageParts(text: string, parts?: StoredMessagePart[]): StoredMessagePart[] {
  return buildOutgoingParts(text, parts ?? []);
}

/**
 * Caminho único de envio — sempre resposta (run), fila ou toast de erro.
 */
export async function sendMessage(input: SendMessageInput, deps: SendMessageDeps): Promise<void> {
  const shouldQueue = input.agentBusy || input.planAwaiting;
  const parts = messageParts(input.text, input.parts);
  const intent = resolveTurnIntent({
    text: input.text,
    composerMode: input.composerMode,
    explicitMode: input.mode,
    hasAttachments: (input.parts?.length ?? 0) > 0,
  });
  const sendMode = shouldQueue
    ? ((input.mode ?? input.composerMode) as AgentComposerMode)
    : intent.runMode;

  if (
    !shouldQueue &&
    input.composerMode === "chat" &&
    isExplicitBuildRequest(input.text)
  ) {
    deps.onError?.("Para executar código, mude o modo para Build.");
    return;
  }

  const directChat = !shouldQueue && intent.runMode === "chat";

  if (!shouldQueue && !directChat) {
    deps.beginPendingTurn();
  }

  const { error } = await deps.insertUserMessage(
    input.conversationId,
    parts,
    shouldQueue
      ? { mode: sendMode, turnIntent: intent.kind, queued: true }
      : { mode: sendMode, turnIntent: intent.kind },
  );

  if (error) {
    if (!shouldQueue && !directChat) deps.clearPendingTurn();
    deps.onError?.("Erro ao enviar mensagem");
    return;
  }

  deps.onInserted?.();

  if (!shouldQueue) {
    const ok = await deps.runAgent(input.kind, intent.runMode);
    if (!ok && !directChat) {
      deps.clearPendingTurn();
      deps.onRunFailed?.();
    }
    return;
  }

  const queued = await deps.queueMessage(
    input.projectId,
    input.conversationId,
    input.kind,
    sendMode,
  );

  if (!queued.ok) {
    if (input.planAwaiting) {
      deps.onError?.(
        queued.message ??
          "Não foi possível enfileirar com o plano pendente — aprove ou rejeite o plano e envie de novo.",
      );
      return;
    }
    if (!input.agentBusy) {
      deps.beginPendingTurn();
      const ok = await deps.runAgent(input.kind, intent.runMode);
      if (!ok) {
        deps.clearPendingTurn();
        deps.onRunFailed?.();
      }
      return;
    }
    deps.onError?.(queued.message ?? "Erro ao enfileirar mensagem");
    return;
  }

  deps.onQueued?.(
    queued.message ??
      (input.planAwaiting
        ? "Mensagem na fila — aprove ou rejeite o plano no inspector para continuar."
        : "Mensagem na fila — o agente processará quando terminar."),
  );
}
