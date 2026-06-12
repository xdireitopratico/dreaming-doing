// loop-status.ts — Status determinístico no chat durante o loop (sem LLM narrador).

import type { ChatMessage } from "./types.ts";

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
      const cmd = String(call.arguments.command ?? "").trim().slice(0, 72);
      return cmd ? `rodar \`${cmd}\`` : "rodar comando";
    }
    default:
      return call.name;
  }
}

function formatToolBatch(ctx: LoopUpdateContext): string | null {
  const tools = ctx.tools ?? [];
  if (tools.length === 0) return null;

  const summaries = tools.map(toolSummary);
  const ok = ctx.allOk !== false;
  const step =
    ctx.step && ctx.total ? ` (passo ${ctx.step}/${ctx.total})` : "";

  if (tools.length === 1) {
    const action = summaries[0]!;
    return ok
      ? `Concluído: ${action}${step}.`
      : `Falhou ao ${action}${step} — vou corrigir.`;
  }

  const joined = summaries.slice(0, 3).join(", ");
  const extra = summaries.length > 3 ? ` e mais ${summaries.length - 3}` : "";
  return ok
    ? `Concluído: ${joined}${extra}${step}.`
    : `Algumas ferramentas falharam (${joined}${extra})${step} — vou corrigir.`;
}

/** Mensagem curta e factual para o chat — nunca inventa intenção do agente. */
export function formatLoopStatus(ctx: LoopUpdateContext): string | null {
  switch (ctx.kind) {
    case "tool_batch":
      return formatToolBatch(ctx);

    case "typecheck_fail":
      return "TypeScript apontou erro no que acabei de mexer — corrigindo antes de seguir.";

    case "build_check":
      return "Conferindo se o projeto compila…";

    case "build_ok":
      return "Build passou — sigo para o próximo passo.";

    case "stuck":
      return "Percebi repetição nas mesmas ações — vou mudar de abordagem.";

    case "build_fix":
      return "Build ainda falhou — corrijo os erros antes de entregar.";

    case "resume":
      if (ctx.fixResume) {
        return "Retomei para corrigir erros de build.";
      }
      if (ctx.resumeStep && ctx.total) {
        return `Retomei do passo ${ctx.resumeStep} de ${ctx.total}.`;
      }
      return "Retomei de onde parei.";

    case "processing":
      return "Ainda processando — continuo em instantes.";

    case "model_error":
      return `Erro temporário no modelo (${ctx.errorDetail ?? "falha de API"}) — tentando de novo.`;

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
  const paths = input.touchedPaths.filter(Boolean);
  if (input.errorMessage?.trim()) {
    const files = paths.length > 0 ? ` Arquivos tocados: ${paths.slice(-5).join(", ")}.` : "";
    return `Não consegui concluir: ${input.errorMessage.trim()}.${files}`;
  }
  if (paths.length === 0) {
    return "Pronto — confere o preview e me diz se quer ajustar algo.";
  }
  if (paths.length === 1) {
    return `Pronto — mexi em \`${paths[0]}\`. Confere o preview.`;
  }
  const listed = paths
    .slice(-4)
    .map((p) => `\`${p}\``)
    .join(", ");
  const extra = paths.length > 4 ? ` e mais ${paths.length - 4}` : "";
  return `Pronto — alterei ${listed}${extra}. Confere o preview.`;
}

/** Fechamento do mesmo agente — sem LLM narrador paralelo. */
export function resolveClosureText(input: ClosureResolveInput): string {
  const fromAgent = lastAssistantProse(input.messages);
  if (fromAgent) return fromAgent;
  return formatClosureFallback(input);
}