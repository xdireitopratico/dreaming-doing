/** Contrato de ferramentas — enforcement gracioso pós-llmChat (incl. thinking streamed). */

export const MAX_TOOL_MISSES = 3;

export const TOOL_NUDGE_MESSAGE =
  "Por favor, agora use ferramentas (fs_read, fs_write, fs_edit ou shell_exec) para implementar. " +
  "Pode manter 1 frase curta de narração junto com as tool_calls.";

export const TOOL_FAIL_USER_MESSAGE =
  "O modelo não conseguiu usar ferramentas após 3 tentativas. " +
  "Tente outro modelo nas preferências ou simplifique o pedido.";

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
      exploreMessage: `Modelo não usou ferramentas após ${MAX_TOOL_MISSES} tentativas`,
      userMessage: TOOL_FAIL_USER_MESSAGE,
    };
  }

  return {
    kind: "retry",
    attempt,
    exploreMessage: `Resposta sem ferramentas${streamedNote} — reforçando execução (${attempt}/${MAX_TOOL_MISSES})`,
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
  if (wasStreamed) return "[raciocínio interno sem ferramentas]";
  return responseContent?.trim() || "Concluído.";
}
