// runtime/phases/graceful-closing.ts — Fechamento amigável antes de fail duro (Fase 2.2)
import { sanitizeUserFacingProse } from "../../sanitize-prose.ts";
import type { ChatMessage, LLMProvider, ProposedPlan } from "../../types.ts";
import { attemptPlanStuckClosing } from "./plan-turn.ts";

export type GracefulClosingDeps = {
  messages: ChatMessage[];
  configuredModel: () => LLMProvider;
  finishPlanProposal: (proposed: ProposedPlan) => Promise<void>;
};

export async function attemptGracefulClosing(
  deps: GracefulClosingDeps,
  reason: "tool_miss" | "build_fail" | "plan_stuck",
): Promise<string | null> {
  if (reason === "plan_stuck") {
    return attemptPlanStuckClosing({
      messages: deps.messages,
      model: deps.configuredModel(),
      finishProposal: deps.finishPlanProposal,
    });
  }

  const nudge: Record<"tool_miss" | "build_fail", string> = {
    tool_miss:
      "O sistema detectou que você não está progredindo. " +
      "Sem usar ferramentas, escreva uma mensagem amigável para o usuário " +
      "explicando o que estava tentando fazer, o que deu errado, e perguntando " +
      "se pode continuar na próxima sessão.",
    build_fail:
      "O build falhou após várias tentativas. " +
      "Sem usar ferramentas, escreva uma mensagem para o usuário " +
      "explicando qual foi o erro, o que foi tentado, e perguntando " +
      "se pode continuar corrigindo na próxima sessão.",
  };

  deps.messages.push({ role: "user", content: nudge[reason] });

  try {
    const response = await deps.configuredModel().chat({
      messages: deps.messages,
      tool_choice: "none",
      tools: [],
      max_tokens: 1024,
      temperature: 0.7,
    });

    const text = (response.content ?? "").trim();
    if (!text) return null;
    return sanitizeUserFacingProse(text);
  } catch {
    return null;
  }
}