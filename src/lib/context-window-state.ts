import type { AgentProgress } from "@/lib/agent-progress";
import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  loadAgentPreferences,
  type ContextWindowMode,
} from "@/lib/agent-preferences";
import type { ChatMessage } from "@/lib/chat-types";
import { estimateMessageTokens } from "@/lib/token-usage";

export type ContextWindowUsage = NonNullable<AgentProgress["contextUsage"]>;

export type ContextWindowConfig = {
  mode: ContextWindowMode;
  windowTokens: number;
};

function normalizeWindowTokens(windowTokens?: number): number {
  return Number.isFinite(windowTokens) && Number(windowTokens) > 0
    ? Math.floor(Number(windowTokens))
    : DEFAULT_CONTEXT_WINDOW_TOKENS;
}

function roundPercent(percent: number): number {
  return Math.round(percent * 10) / 10;
}

export function resolveContextWindowConfig(): ContextWindowConfig {
  const prefs = loadAgentPreferences();
  return {
    mode: prefs.contextWindow?.mode ?? "manual",
    windowTokens: normalizeWindowTokens(prefs.contextWindow?.windowTokens),
  };
}

export function estimateConversationUsageTokens(messages: ChatMessage[]): number {
  if (messages.length === 0) return 0;
  return estimateMessageTokens(
    messages.map((message) => ({
      content: message.content,
      tool_calls: message.toolCalls?.map((tool) => ({
        name: tool.name,
        args: tool.args,
      })),
    })),
  );
}

/**
 * Fonte de verdade do composer:
 * - configuração vem sempre das preferências atuais do usuário;
 * - consumo persistido vem do histórico real da conversa;
 * - stream ao vivo só faz overlay temporário enquanto o run está ativo.
 */
export function deriveContextWindowUsage(
  messages: ChatMessage[],
  config: ContextWindowConfig,
  liveContextUsage?: AgentProgress["contextUsage"] | null,
): ContextWindowUsage {
  const windowTokens = normalizeWindowTokens(config.windowTokens);
  const usageTokens =
    typeof liveContextUsage?.usageTokens === "number" && liveContextUsage.usageTokens >= 0
      ? liveContextUsage.usageTokens
      : estimateConversationUsageTokens(messages);
  const percent =
    windowTokens > 0 ? roundPercent(Math.min(100, (usageTokens / windowTokens) * 100)) : 0;

  return {
    usageTokens,
    windowTokens,
    percent,
    mode: config.mode,
    compacting: liveContextUsage?.compacting === true,
  };
}

export function resolveComposerContextUsage(
  messages: ChatMessage[],
  liveContextUsage?: AgentProgress["contextUsage"] | null,
): ContextWindowUsage {
  return deriveContextWindowUsage(messages, resolveContextWindowConfig(), liveContextUsage);
}
