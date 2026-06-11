import type { AgentComposerMode } from "@/lib/chat-types";
import type { ForgeSessionKind } from "@/lib/taste";
import type { StoredMessagePart } from "@/lib/chat-attachments";

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
    mode: AgentComposerMode,
  ) => Promise<{ ok: boolean; message?: string }>;
  runAgent: (kind: ForgeSessionKind) => Promise<boolean>;
  beginPendingTurn: () => void;
  clearPendingTurn: () => void;
  onInserted?: () => void;
  onQueued?: (message: string) => void;
  onError?: (message: string) => void;
  onRunFailed?: () => void;
};

function messageParts(text: string, parts?: StoredMessagePart[]): StoredMessagePart[] {
  if (parts && parts.length > 0) return parts;
  return [{ type: "text", text }];
}

/**
 * Caminho único de envio — sempre resposta (run), fila ou toast de erro.
 */
export async function sendMessage(input: SendMessageInput, deps: SendMessageDeps): Promise<void> {
  const sendMode = (input.mode ?? input.composerMode) as AgentComposerMode;
  const shouldQueue = input.agentBusy || input.planAwaiting;
  const parts = messageParts(input.text, input.parts);

  const { error } = await deps.insertUserMessage(
    input.conversationId,
    parts,
    shouldQueue ? { mode: sendMode, queued: true } : { mode: sendMode },
  );

  if (error) {
    deps.onError?.("Erro ao enviar mensagem");
    return;
  }

  deps.onInserted?.();

  if (!shouldQueue) {
    deps.beginPendingTurn();
    const ok = await deps.runAgent(input.kind);
    if (!ok) {
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
      const ok = await deps.runAgent(input.kind);
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
