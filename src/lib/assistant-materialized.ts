import type { ChatMessage } from "@/lib/chat-types";

function hasVisibleText(message: ChatMessage): boolean {
  if (message.content?.trim()) return true;

  const parts = message.parts;
  if (Array.isArray(parts)) {
    return parts.some(
      (p) =>
        p &&
        typeof p === "object" &&
        (p as { type?: string; text?: string }).type === "text" &&
        typeof (p as { text?: string }).text === "string" &&
        (p as { text: string }).text.trim().length > 0,
    );
  }

  return false;
}

/** Meta de checkpoint — não é terminal para UX nem persistência. */
export function isCheckpointMeta(meta: Record<string, unknown>): boolean {
  return meta.checkpoint === true;
}

/** Terminal no DB (meta) — espelho backend; rejeita partial e checkpoint. */
export function isTerminalAssistantMeta(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta || typeof meta !== "object") return false;
  if (meta.partial === true) return false;
  if (isCheckpointMeta(meta)) return false;
  return typeof meta.finishedAt === "string" && meta.finishedAt.trim().length > 0;
}

/** Libera live slot / acknowledge quando a mensagem assistant é terminal no DB. */
export function canReleaseLiveSlot(message: ChatMessage): boolean {
  return isAssistantRunMaterialized(message);
}

/**
 * Só solta o run ao materializar quando o progresso do agente já ficou terminal.
 * Se o assistant materializa antes do fim do loop, mantemos o slot vivo para não
 * trocar a timeline rica por um snapshot raso no meio da execução.
 */
export function shouldAcknowledgeMaterializedRun(
  message: ChatMessage,
  progressFinished: boolean,
): boolean {
  return progressFinished && canReleaseLiveSlot(message);
}

/** Só libera acknowledge/frozen quando a mensagem assistant é terminal no DB (finishedAt, não partial). */
export function isAssistantRunMaterialized(message: ChatMessage): boolean {
  const meta = message.meta;
  if (!meta || typeof meta !== "object") return false;

  const m = meta as Record<string, unknown>;
  if (m.partial === true) return false;
  if (isCheckpointMeta(m)) return false;
  if (typeof m.finishedAt !== "string" || !m.finishedAt.trim()) return false;

  return hasVisibleText(message);
}

/** Terminal no DB com cardSnapshot completo — fonte de verdade pós-F5. */
export function hasMaterializedCardSnapshot(msg?: ChatMessage): boolean {
  if (!msg || !isAssistantRunMaterialized(msg)) return false;
  const snap = (msg.meta as Record<string, unknown> | undefined)?.cardSnapshot;
  return snap !== null && typeof snap === "object";
}

/** Banco tem snapshot terminal com timeline útil para o inspector. */
export function hasInspectorReadySnapshot(msg?: ChatMessage): boolean {
  if (!hasMaterializedCardSnapshot(msg)) return false;
  const meta = (msg!.meta ?? {}) as Record<string, unknown>;
  const snap = meta.cardSnapshot as Record<string, unknown>;
  const timeline = snap.timeline;
  if (Array.isArray(timeline) && timeline.length > 0) return true;
  const streamTail = meta.streamTail;
  if (Array.isArray(streamTail) && streamTail.length > 0) return true;
  const tools = snap.tools;
  if (Array.isArray(tools) && tools.length > 0) return true;
  return false;
}
