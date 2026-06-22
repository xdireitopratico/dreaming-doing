/** Contrato de ferramentas — enforcement gracioso pós-llmChat (incl. thinking streamed). */

export const MAX_TOOL_MISSES = 3;

export const TOOL_NUDGE_MESSAGE = "";

export const TOOL_FAIL_USER_MESSAGE = "O modelo não usou ferramentas após 3 tentativas.";

export type ToolProgressDecision =
  | { kind: "ok" }
  | { kind: "retry"; attempt: number; exploreMessage: string; userNudge: string; forceToolsNext: boolean }
  | { kind: "fail"; exploreMessage: string; userMessage: string };

export function decideToolProgress(input: {
  hasToolCalls: boolean;
  missCount: number;
  wasStreamed?: boolean;
}): ToolProgressDecision {
  if (input.hasToolCalls) return { kind: "ok" };

  const attempt = input.missCount + 1;
  const streamedNote = input.wasStreamed ? " (raciocínio sem ação)" : "";

  if (attempt >= MAX_TOOL_MISSES) {
    return {
      kind: "fail",
      exploreMessage: `Sem ferramentas após ${MAX_TOOL_MISSES} tentativas`,
      userMessage: TOOL_FAIL_USER_MESSAGE,
    };
  }

  return {
    kind: "retry",
    attempt,
    exploreMessage: `Sem ferramentas (${attempt}/${MAX_TOOL_MISSES})`,
    userNudge: TOOL_NUDGE_MESSAGE,
    forceToolsNext: attempt >= 2,
  };
}

/** Conteúdo para histórico quando o modelo só streamou thinking. */
export function assistantContentForHistory(
  responseContent: string | null | undefined,
  assistantText: string,
  narrationBuffer: string,
  wasStreamed: boolean,
): string {
  const trimmed = assistantText.trim();
  if (trimmed) return trimmed;
  const narration = narrationBuffer.trim();
  if (narration) return narration.slice(0, 2000);
  if (wasStreamed) return "";
  return responseContent?.trim() || "";
}
