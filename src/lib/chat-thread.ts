/**
 * @deprecated Implementação movida para src/lib/forge-chat — re-export de compatibilidade.
 */
export {
  PENDING_RUN_ID,
  buildForgeChatThread as buildChatThread,
  resolveForgeAssistantProgress as resolveAssistantProgress,
} from "@/lib/forge-chat";

export type {
  BuildForgeChatThreadOptions as BuildChatThreadOptions,
  ForgeChatThreadItem as ChatThreadItem,
} from "@/lib/forge-chat/types";