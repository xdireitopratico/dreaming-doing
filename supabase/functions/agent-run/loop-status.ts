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
    return `Erro: ${input.errorMessage.trim()}`;
  }
  return "";
}

/** Fechamento do mesmo agente — sem LLM narrador paralelo. */
export function resolveClosureText(input: ClosureResolveInput): string {
  const fromAgent = lastAssistantProse(input.messages);
  if (fromAgent) return fromAgent;
  return formatClosureFallback(input);
}
