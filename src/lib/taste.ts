/**
 * TASTE — estado de usuário novo (pré-setup).
 *
 * Conceito correto:
 * - TASTE = usuário que ainda não configurou seu setup (BYOK)
 * - Uma vez setup feito, TASTE deixa de existir; vale o que o usuário configurou
 * - "taste_chat" / "taste_start" NÃO são session kinds: são AÇÕES dentro do estado TASTE
 *   (50 mensagens de chat + 1 start de projeto, grátis, até configurar)
 *
 * Em runtime:
 * - `SessionKind = "taste" | "byok"` (apenas 2 valores)
 * - Quando `kind === "taste"`, `tasteAction` diz se o request é chat ou start
 * - Quando `kind === "byok"`, `tasteAction` é irrelevante (sempre null/undefined)
 */

export const TASTE_CHAT_DEFAULT = 50;
export const TASTE_START_DEFAULT = 1;

/** Estado de sessão em runtime: usuário novo (taste) ou usuário configurado (byok). */
export type ForgeSessionKind = "taste" | "byok";

/** Ação que está sendo executada dentro do estado TASTE. Sem efeito quando kind === "byok". */
export type TasteAction = "chat" | "start";

/** Quota de cortesia do estado TASTE. Quando `hasUserLlmKey === true`, TASTE está finalizado. */
export type TasteQuota = {
  tasteChatRemaining: number;
  tasteStartRemaining: number;
  hasUserLlmKey: boolean;
};

/** User está em TASTE? = não tem chave LLM própria E ainda tem alguma cortesia. */
export function isInTaste(
  quota: Pick<TasteQuota, "hasUserLlmKey" | "tasteChatRemaining" | "tasteStartRemaining">,
): boolean {
  return !quota.hasUserLlmKey && (quota.tasteChatRemaining > 0 || quota.tasteStartRemaining > 0);
}

/** Resolve o kind de sessão: tem chave? byok. Não tem? taste. */
export function resolveSessionKind(
  quota: Pick<TasteQuota, "hasUserLlmKey">,
  explicit?: ForgeSessionKind,
): ForgeSessionKind {
  if (explicit === "byok" || explicit === "taste") return explicit;
  return quota.hasUserLlmKey ? "byok" : "taste";
}

/** User pode enviar uma mensagem no chat TASTE? (= tem cortesia de chat) */
export function canSendTasteChat(
  quota: Pick<TasteQuota, "hasUserLlmKey" | "tasteChatRemaining">,
): boolean {
  return !quota.hasUserLlmKey && quota.tasteChatRemaining > 0;
}

/** User pode fazer Start Project no TASTE? (= tem cortesia de start) */
export function canStartTasteProject(
  quota: Pick<TasteQuota, "hasUserLlmKey" | "tasteStartRemaining">,
): boolean {
  return !quota.hasUserLlmKey && quota.tasteStartRemaining > 0;
}

/** Converte o kind + action em algo que o servidor entende. */
export function buildSessionPayload(kind: ForgeSessionKind, action?: TasteAction) {
  if (kind === "byok") return { sessionKind: "byok" as const };
  return { sessionKind: "taste" as const, tasteAction: action ?? "chat" };
}

export function tasteQuotaFromProfile(
  row:
    | {
        taste_chat_remaining?: number | null;
        taste_start_remaining?: number | null;
        trial_messages_remaining?: number | null;
      }
    | null
    | undefined,
): Pick<TasteQuota, "tasteChatRemaining" | "tasteStartRemaining"> {
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
