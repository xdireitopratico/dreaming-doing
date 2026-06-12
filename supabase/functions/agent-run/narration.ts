// narration.ts — Comunicação do agente em exatamente 3 momentos (sem camadas extras).
//
// 1. Abertura — usuário manda mensagem → LLM responde com interação humana
// 2. Loop     — durante build/planejamento → compartilha o processo ao vivo
// 3. Fechamento — o que entregou, o que tocou, expectativa do usuário

import type { ClassificationResult } from "./router.ts";

export type CommunicationPhase = "opening" | "loop" | "closure";

// ─── 1. ABERTURA ───────────────────────────────────────────────────────────

export type OpeningContext = {
  userSummary: string;
  intentType?: ClassificationResult["type"];
  planMode?: boolean;
  approvedPlan?: boolean;
  planHeadline?: string;
};

const INTENT_OPENING: Record<string, string> = {
  new_project: "montar isso do zero",
  modify: "ajustar o que já existe",
  fix: "corrigir o problema",
  add_dep: "adicionar o que falta nas dependências",
  other: "atender seu pedido",
};

/** Primeira resposta humana após o usuário enviar mensagem. */
export function buildOpeningMessage(ctx: OpeningContext): string {
  const summary = ctx.userSummary?.trim() || "seu pedido";
  const intent = INTENT_OPENING[ctx.intentType ?? "other"] ?? INTENT_OPENING.other;

  if (ctx.approvedPlan) {
    const headline = (ctx.planHeadline ?? "o plano que você aprovou").trim().slice(0, 160);
    return `Perfeito — vou executar ${headline}. Te aviso conforme for avançando e no final resumo o que ficou pronto.`;
  }

  if (ctx.planMode) {
    return `Entendi: ${summary}. Antes de codar, vou te propor um plano passo a passo para você revisar no inspector.`;
  }

  return `Entendi — você quer ${summary}. Vou ${intent} e te conto o que encontro pelo caminho.`;
}

// ─── 2. LOOP ───────────────────────────────────────────────────────────────

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
  | "processing";

export type LoopUpdateContext = {
  kind: LoopUpdateKind;
  tools?: ToolCallLike[];
  step?: number;
  total?: number;
  allOk?: boolean;
  resumeStep?: number;
  fixResume?: boolean;
};

function humanToolPhrase(call: ToolCallLike): string | null {
  const args = call.arguments ?? {};
  switch (call.name) {
    case "fs_read":
      return `estou lendo \`${String(args.path ?? "um arquivo")}\``;
    case "fs_read_many":
      return "estou lendo um conjunto de arquivos do projeto";
    case "fs_list":
      return "estou vendo a estrutura de pastas";
    case "fs_search":
    case "fs_glob":
      return "estou buscando no código o que preciso";
    case "fs_write":
      return `vou criar \`${String(args.path ?? "um arquivo")}\``;
    case "fs_edit":
      return `vou editar \`${String(args.path ?? "um arquivo")}\``;
    case "shell_exec": {
      const cmd = String(args.command ?? "").trim().slice(0, 40);
      return cmd ? `vou rodar \`${cmd}\`` : "vou rodar um comando no sandbox";
    }
    case "web_search":
      return "vou pesquisar uma referência na web";
    case "web_fetch":
      return "vou buscar documentação";
    default:
      return null;
  }
}

/** Atualizações durante o looping — o que está fazendo, problema, próximo passo. */
export function buildLoopUpdate(ctx: LoopUpdateContext): string | null {
  switch (ctx.kind) {
    case "processing":
      return "Ainda estou processando — já volto com a próxima parte.";

    case "resume":
      if (ctx.fixResume) {
        return "Retomei para corrigir os erros de build que apareceram.";
      }
      if (ctx.resumeStep && ctx.total) {
        return `Retomei de onde parei — continuo a partir do passo ${ctx.resumeStep} de ${ctx.total}.`;
      }
      return "Retomei de onde parei e sigo com o que faltava.";

    case "tool_batch": {
      const tools = ctx.tools ?? [];
      if (!tools.length) return null;
      const phrases = tools
        .map(humanToolPhrase)
        .filter((p): p is string => !!p);
      const unique = [...new Set(phrases)];
      const action =
        unique.length <= 2
          ? unique.join(" e ")
          : `${unique.slice(0, 2).join(", ")} e mais ${unique.length - 2} coisa(s)`;
      if (ctx.allOk === false) {
        return `Encontrei um obstáculo em ${action}. Vou ajustar e seguir.`;
      }
      return `Agora ${action}.`;
    }

    case "typecheck_fail":
      return "O TypeScript apontou erro no que acabei de mexer — vou corrigir antes de continuar.";

    case "build_check":
      return "Vou conferir se o projeto compila com as mudanças que fiz.";

    case "build_ok":
      return "Build passou — sigo para o próximo passo.";

    case "stuck":
      return "Percebi que estava repetindo a mesma abordagem — vou mudar o caminho.";

    case "build_fix":
      return "O build ainda não passou — vou corrigir os erros antes de te entregar.";

    default:
      return null;
  }
}

// ─── 3. FECHAMENTO ─────────────────────────────────────────────────────────

export type ClosureContext = {
  touchedPaths: string[];
  priorConversation?: string;
  errorMessage?: string;
  partial?: boolean;
  silentResume?: boolean;
};

export type ResolvedClosure = {
  text: string;
  emitExtra: boolean;
  extraText?: string;
};

function formatTouched(paths: string[]): string {
  if (!paths.length) return "";
  const shown = paths.slice(-3).map((p) => `\`${p}\``).join(", ");
  const extra = paths.length > 3 ? ` e mais ${paths.length - 3}` : "";
  return `${shown}${extra}`;
}

function closureAlreadyComplete(text: string): boolean {
  return /preview|confere|mexi|entreguei|pronto|arquivo/i.test(text);
}

/** Mensagem final — entrega, arquivos tocados, expectativa do usuário. */
export function buildClosureMessage(ctx: ClosureContext): ResolvedClosure {
  const prior = ctx.priorConversation?.trim() ?? "";
  const files = ctx.touchedPaths ?? [];
  const fileCount = files.length;

  if (ctx.errorMessage?.trim()) {
    const err = ctx.errorMessage.trim();
    if (prior && !prior.includes(err.slice(0, 24))) {
      return { text: `${prior}\n\n${err}`, emitExtra: true, extraText: err };
    }
    return { text: err, emitExtra: !prior };
  }

  if (ctx.silentResume) {
    const note =
      fileCount > 0
        ? "Ainda estou trabalhando — já deixei parte do pedido pronta."
        : "Ainda estou trabalhando no seu pedido.";
    if (prior) return { text: prior, emitExtra: false };
    return { text: note, emitExtra: true };
  }

  if (ctx.partial) {
    const note =
      fileCount === 0
        ? "Cheguei até aqui — posso continuar quando você quiser."
        : `Até aqui mexi em ${formatTouched(files)}. Posso seguir no próximo passo.`;
    if (prior) return { text: `${prior}\n\n${note}`, emitExtra: true, extraText: note };
    return { text: note, emitExtra: true };
  }

  if (fileCount === 0) {
    if (prior) return { text: prior, emitExtra: false };
    return {
      text: "Me conta o que você quer construir ou ajustar — estou aqui pra ajudar.",
      emitExtra: true,
    };
  }

  const touched = formatTouched(files);
  const delivery =
    fileCount === 1
      ? `Pronto — mexi em ${touched}. Abre o preview pra ver; se quiser refinar algo, é só falar.`
      : `Pronto — entreguei em **${fileCount} arquivos** (${touched}). Confere o preview e me diz se quer algum ajuste.`;

  if (prior) {
    if (closureAlreadyComplete(prior)) {
      return { text: prior, emitExtra: false };
    }
    return { text: `${prior}\n\n${delivery}`, emitExtra: true, extraText: delivery };
  }

  return { text: delivery, emitExtra: true };
}