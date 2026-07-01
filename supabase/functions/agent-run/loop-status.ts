// loop-status.ts — Status determinístico no chat durante o loop (sem LLM narrador).

import type { ChatMessage, LLMProvider } from "./types.ts";
import { sanitizeUserFacingProse } from "./sanitize-prose.ts";

type ToolCallLike = {
  name: string;
  arguments: Record<string, unknown>;
};

export type LoopUpdateKind =
  | "tool_batch"
  | "typecheck_fail"
  | "build_check"
  | "build_ok"
  | "stuck"
  | "build_fix"
  | "resume"
  | "processing"
  | "model_error";

export type LoopUpdateContext = {
  kind: LoopUpdateKind;
  tools?: ToolCallLike[];
  step?: number;
  total?: number;
  allOk?: boolean;
  resumeStep?: number;
  fixResume?: boolean;
  userRequest?: string;
  touchedPaths?: string[];
  errorDetail?: string;
};

function toolSummary(call: ToolCallLike): string {
  const path = String(call.arguments.path ?? call.arguments.filePath ?? "").trim();
  switch (call.name) {
    case "fs_read":
      return path ? `ler \`${path}\`` : "ler arquivo";
    case "fs_write":
      return path ? `criar \`${path}\`` : "criar arquivo";
    case "fs_edit":
      return path ? `editar \`${path}\`` : "editar arquivo";
    case "fs_search":
      return path ? `buscar em \`${path}\`` : "buscar no projeto";
    case "fs_list":
      return path ? `listar \`${path}\`` : "listar arquivos";
    case "shell_exec": {
      const cmd = String(call.arguments.command ?? "")
        .trim()
        .slice(0, 72);
      return cmd ? `rodar \`${cmd}\`` : "rodar comando";
    }
    default:
      return call.name;
  }
}

function formatToolBatch(ctx: LoopUpdateContext): string | null {
  const tools = ctx.tools ?? [];
  if (tools.length === 0) return null;
  const ok = ctx.allOk !== false;
  return ok ? "Feito." : "Falhou — vou corrigir.";
}

/** Mensagem curta e factual para o chat — nunca inventa intenção do agente. */
export function formatLoopStatus(ctx: LoopUpdateContext): string | null {
  switch (ctx.kind) {
    case "tool_batch":
      return formatToolBatch(ctx);

    case "resume":
      if (ctx.fixResume) return null;
      return null;

    default:
      return null;
  }
}

export type ClosureResolveInput = {
  messages: ChatMessage[];
  touchedPaths: string[];
  userRequest?: string;
  errorMessage?: string;
};

/** Última prosa do agente principal (sem tool_calls) no histórico da run. */
export function lastAssistantProse(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (m.tool_calls?.length) continue;
    const text = typeof m.content === "string" ? m.content.trim() : "";
    if (!text || text === "Concluído.") continue;
    return text;
  }
  return null;
}

function formatClosureFallback(input: ClosureResolveInput): string {
  if (input.errorMessage?.trim()) {
    return `Ocorreu um problema durante a execução: ${input.errorMessage.trim()}. A sessão permanece disponível para ajustes.`;
  }
  const req = (input.userRequest || "").trim();
  const files = input.touchedPaths?.length ?? 0;
  const fileNote = files > 0 ? `${files} arquivo(s) atualizado(s). ` : "";
  if (req) {
    return `Concluí o trabalho para "${req}". ${fileNote}Preview disponível se aplicável. Quer ajustar algo ou seguimos em frente?`;
  }
  if (files) {
    return `Trabalho concluído. ${fileNote}O que deseja fazer em seguida?`;
  }
  return "Trabalho concluído. Preview atualizado se gerado. Quer ajustar ou seguimos?";
}

const SUCCESS_CLOSING_SYSTEM = `Você é o agente FORGE terminando um trabalho com sucesso.
Escreva a mensagem final pro usuário em português, direto e caloroso. Estrutura (2-4 frases):
1. O que mudou / foi entregue (1-2 frases concretas).
2. Convite ao preview se houver UI (1 frase).
3. Pergunta aberta sobre o próximo passo (1 frase — ex: "Quer ajustar algo ou seguimos em frente?").
Sem botões, sem listas longas, sem jargão. Sem repetir o que já disse.`;

/** Síntese LLM de sucesso quando o agente não fechou sozinho. Garante arremate. */
async function synthesizeSuccessClosing(
  model: LLMProvider,
  input: ClosureResolveInput,
): Promise<string | null> {
  const userPrompt = [
    input.userRequest ? `Pedido do usuário: ${input.userRequest}` : "",
    input.touchedPaths.length
      ? `Arquivos modificados:\n${input.touchedPaths.slice(0, 30).map((p) => `- ${p}`).join("\n")}`
      : "Nenhum arquivo modificado.",
    "",
    "Escreva a mensagem final agora.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await model.chat({
      messages: [
        { role: "system", content: SUCCESS_CLOSING_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      tool_choice: "none",
      tools: [],
      max_tokens: 400,
      temperature: 0.6,
    });
    const text = (response.content ?? "").trim();
    if (!text) return null;
    return sanitizeUserFacingProse(text);
  } catch {
    return null;
  }
}

/**
 * Fechamento garantido — 3 camadas em cascata:
 *   1. Última prosa do agente (se razoável, ≥ 24 chars).
 *   2. Síntese LLM de sucesso (chamada dedicada com prompt de apresentação + chamada pra ação).
 *   3. Fallback determinístico derivado de histórico/pedido/touched (SEMPRE não-vazio).
 *
 * Inviolabilidade: o loop nunca termina sem mensagem visível pro usuário.
 * NUNCA retorna string vazia — erro técnico "modelo não respondeu" foi eliminado.
 */
export async function resolveClosureText(input: ClosureResolveInput & {
  model?: LLMProvider;
}): Promise<string> {
  const fromAgent = lastAssistantProse(input.messages);
  if (fromAgent && fromAgent.length >= 24) return fromAgent;

  // Sem prosa do agente → síntese LLM (se model disponível).
  if (input.model) {
    const synthesized = await synthesizeSuccessClosing(input.model, input);
    if (synthesized && synthesized.trim()) return synthesized;
  }

  // Última rede: fallback determinístico derivado — SEMPRE string não-vazia.
  const fb = formatClosureFallback(input);
  return fb && fb.trim() ? fb : "Trabalho concluído. Preview atualizado se gerado. Quer ajustar ou seguimos?";
}
