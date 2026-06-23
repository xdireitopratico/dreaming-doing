import type { AgentComposerMode } from "@/lib/chat-types";
import type { ForgeSessionKind } from "@/lib/taste";
import { buildOutgoingParts, type StoredMessagePart } from "@/lib/chat-attachments";
import { resolveTurnIntent, type AgentRunMode } from "@/lib/turn-intent";

export type SendMessageInput = {
  text: string;
  mode?: AgentComposerMode;
  parts?: StoredMessagePart[];
  composerMode: AgentComposerMode;
  conversationId: string;
  projectId: string;
  kind: ForgeSessionKind;
  agentBusy: boolean;
  /** Fila global pausada — composer livre; mensagem vai direto (não enfileira). */
  queuePaused?: boolean;
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
    payload: { text: string; parts: StoredMessagePart[]; repeat?: number },
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
 * Mensagens enfileiradas NÃO entram no chat (só no dock Q até o drain).
 */
export async function sendMessage(input: SendMessageInput, deps: SendMessageDeps): Promise<void> {
  const shouldQueue = input.agentBusy && !input.queuePaused;
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

  const directChat = !shouldQueue && intent.runMode === "chat";

  if (!shouldQueue && !directChat) {
    deps.beginPendingTurn();
  }

  if (shouldQueue) {
    const queued = await deps.queueMessage(
      input.projectId,
      input.conversationId,
      input.kind,
      sendMode,
      { text: input.text.trim(), parts, repeat: 1 },
    );

    if (!queued.ok) {
      deps.onError?.(queued.message ?? "Erro ao enfileirar mensagem");
      return;
    }

    deps.onQueued?.(
      queued.message ?? "Mensagem na fila — o agente processará quando terminar a tarefa atual.",
    );
    return;
  }

  const { error } = await deps.insertUserMessage(input.conversationId, parts, {
    mode: sendMode,
    turnIntent: intent.kind,
  });

  if (error) {
    if (!directChat) deps.clearPendingTurn();
    deps.onError?.("Erro ao enviar mensagem");
    return;
  }

  deps.onInserted?.();

  const ok = await deps.runAgent(input.kind, intent.runMode);
  if (!ok && !directChat) {
    deps.clearPendingTurn();
    deps.onRunFailed?.();
  }
}