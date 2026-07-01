// runtime/terminal-user-message.ts — Central choke point for AC1: always emit non-empty user prose + persistFinal
// Pure ensure + emit/persist wrapper. Used by resumable early exits and recoverable closes.
// Never returns empty string. Prefers deterministic history-derived prose.

import type { ChatMessage } from "../types.ts";
import { lastAssistantProse } from "../loop-status.ts";

// Minimal pure fallback (mirrors/extends formatClosureFallback logic, never empty).
function formatSafeFallback(touchedPaths: string[], userRequest?: string, errorMessage?: string): string {
  if (errorMessage?.trim()) {
    return `Ocorreu um problema: ${errorMessage.trim()}. Retomando para ajustes.`;
  }
  const req = (userRequest || "").trim();
  const files = touchedPaths?.length ?? 0;
  const note = files > 0 ? `${files} arquivo(s) tocados. ` : "";
  if (req) {
    return `Retomando "${req}". ${note}O trabalho continua em seguida.`;
  }
  if (files) {
    return `Retomando. ${note}Sessão disponível.`;
  }
  return "Retomando automaticamente o trabalho anterior.";
}

/**
 * Pure function: given history + context, return non-empty user-visible prose.
 * Wraps lastAssistantProse + safe deterministic fallback. NEVER returns "".
 */
export function ensureUserMessage(
  messages: ChatMessage[],
  touchedPaths: string[] = [],
  userRequest?: string,
  errorMessage?: string
): string {
  const from = lastAssistantProse(messages);
  if (from && from.trim().length > 0) return from.trim();
  return formatSafeFallback(touchedPaths, userRequest, errorMessage);
}

export type TerminalPersistOpts = {
  lastFinishOk?: boolean;
  finished?: boolean;
  buildFailed?: boolean;
};

export type TerminalEmitDeps = {
  emit: (type: string, data: unknown) => void;
  persistFinal: (summary: string, opts?: TerminalPersistOpts) => Promise<void>;
};

/**
 * Always emit a terminal (or chunk-final) user message + persistFinal.
 * Unconditional; central place so AC1 is enforced in one spot.
 */
export async function emitTerminalUserMessage(
  deps: TerminalEmitDeps,
  prose: string,
  final: boolean = true,
  lastFinishOk: boolean = true,
  finished: boolean = true,
  persistOpts?: TerminalPersistOpts,
): Promise<void> {
  const text = (prose || "").trim() || "Retomando o trabalho...";
  deps.emit("assistant_text", { text, final, append: false });
  await deps.persistFinal(text, {
    lastFinishOk,
    finished,
    ...persistOpts,
  });
}

/**
 * Helper for callers that have full phase deps (emit + persistFinal + state info).
 */
export async function emitAndPersistFromPhase(
  phaseDeps: { emit: any; persistFinal: any; state?: { messages?: ChatMessage[] }; touchedPaths?: Set<string>; originalUserRequest?: string },
  explicitText?: string,
  final = true,
  lastFinishOk = false,
  finished = false   // default false for resumable yields so card not marked finished
): Promise<string> {
  const messages = phaseDeps.state?.messages ?? [];
  const touched = phaseDeps.touchedPaths ? [...phaseDeps.touchedPaths] : [];
  const req = phaseDeps.originalUserRequest;
  const prose = explicitText || ensureUserMessage(messages, touched, req);
  await emitTerminalUserMessage(phaseDeps as any, prose, final, lastFinishOk, finished);
  return prose;
}
