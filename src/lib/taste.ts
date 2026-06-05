/** Fase Taste — NVIDIA concierge + Start Project (antes do BYOK). */

export const TASTE_CHAT_DEFAULT = 50;
export const TASTE_START_DEFAULT = 1;

export type ForgeSessionKind = "taste_chat" | "taste_start" | "byok";

export type TasteQuota = {
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  hasUserLlmKey: boolean;
};

/** Inferência: BYOK se o usuário já tem chave LLM (checado no servidor); no client usamos quota + flag opcional. */
export function resolveSessionKind(
  quota: TasteQuota,
  explicit?: ForgeSessionKind,
): ForgeSessionKind {
  if (explicit) return explicit;
  if (quota.hasUserLlmKey) return "byok";
  return "taste_chat";
}

export function canSendTasteChat(quota: TasteQuota): boolean {
  return !quota.hasUserLlmKey && quota.tasteChatRemaining > 0;
}

export function canStartTasteProject(quota: TasteQuota): boolean {
  return !quota.hasUserLlmKey && quota.tasteStartRemaining > 0;
}

export function tasteQuotaFromProfile(row: {
  taste_chat_remaining?: number | null;
  taste_start_remaining?: number | null;
  trial_messages_remaining?: number | null;
} | null | undefined): Pick<TasteQuota, "tasteChatRemaining" | "tasteStartRemaining"> {
  const chat =
    typeof row?.taste_chat_remaining === "number"
      ? row.taste_chat_remaining
      : typeof row?.trial_messages_remaining === "number"
        ? row.trial_messages_remaining
        : TASTE_CHAT_DEFAULT;
  const start =
    typeof row?.taste_start_remaining === "number"
      ? row.taste_start_remaining
      : TASTE_START_DEFAULT;
  return { tasteChatRemaining: chat, tasteStartRemaining: start };
}