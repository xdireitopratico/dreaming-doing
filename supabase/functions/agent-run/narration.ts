// narration.ts — Comunicação do agente em exatamente 3 momentos (sem camadas extras).
//
// 1. Abertura — usuário manda mensagem → LLM responde com interação humana
// 2. Loop     — durante build/planejamento → compartilha o processo ao vivo
// 3. Fechamento — o que entregou, o que tocou, expectativa do usuário

import type { LLMProvider } from "./types.ts";
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

export type OpeningLLMContext = OpeningContext & {
  userRequest: string;
};

const OPENING_SYSTEM = `Você é o parceiro de desenvolvimento do FORGE — humano, direto, em português.

O usuário acabou de enviar um pedido. Responda como num chat (2–4 frases):
- Confirme o que entendeu
- Diga o que vai fazer agora, em linguagem natural
- Tom de colega de time, não robô

Proibido: "explorando o projeto", "indexando arquivos", listas de passos, markdown pesado, jargão de pipeline.`;

/** Abertura gerada pelo LLM — fallback para template se o modelo falhar. */
export async function generateOpeningMessage(
  model: LLMProvider,
  ctx: OpeningLLMContext,
): Promise<string> {
  const request = ctx.userRequest?.trim() || ctx.userSummary?.trim() || "pedido do usuário";
  const mode = ctx.approvedPlan
    ? "executar plano já aprovado"
    : ctx.planMode
      ? "propor plano antes de codar"
      : "implementar em build";

  try {
    const resp = await model.chat({
      messages: [
        { role: "system", content: OPENING_SYSTEM },
        {
          role: "user",
          content:
            `Pedido do usuário:\n${request}\n\n` +
            `Resumo interno: ${ctx.userSummary?.trim() || request}\n` +
            `Modo: ${mode}`,
        },
      ],
      max_tokens: 320,
      temperature: 0.45,
    });
    const text = (resp.content ?? "").trim();
    if (text.length >= 12) return text;
  } catch {
    /* fallback */
  }
  return buildOpeningMessage(ctx);
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
  userRequest?: string;
};

const CLOSURE_SYSTEM = `Você fecha a entrega no FORGE — mensagem final curta em português (2–4 frases).

Inclua: o que entregou, em quais arquivos (se houver), e peça para o usuário conferir o preview.
Tom humano. Não repita a conversa anterior. Não diga "explorando o projeto".`;

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

  return { text: delivery, emitExtra: true, extraText: delivery };
}

/** Fechamento gerado pelo LLM — texto só da entrega (4º bloco do chat). */
export async function generateClosureMessage(
  model: LLMProvider,
  ctx: ClosureContext,
): Promise<ResolvedClosure> {
  const fallback = buildClosureMessage(ctx);
  const files = ctx.touchedPaths ?? [];
  if (ctx.errorMessage?.trim() || ctx.partial || ctx.silentResume || files.length === 0) {
    return fallback;
  }

  const fileList = files.slice(-8).map((p) => `- ${p}`).join("\n");
  try {
    const resp = await model.chat({
      messages: [
        { role: "system", content: CLOSURE_SYSTEM },
        {
          role: "user",
          content:
            `Pedido original: ${ctx.userRequest?.trim() || "(não informado)"}\n\n` +
            `Arquivos alterados:\n${fileList}\n\n` +
            `Contexto anterior (não repetir):\n${(ctx.priorConversation ?? "").slice(0, 800)}`,
        },
      ],
      max_tokens: 360,
      temperature: 0.4,
    });
    const closing = (resp.content ?? "").trim();
    if (closing.length >= 16) {
      return {
        text: ctx.priorConversation?.trim()
          ? `${ctx.priorConversation.trim()}\n\n${closing}`
          : closing,
        emitExtra: true,
        extraText: closing,
      };
    }
  } catch {
    /* fallback */
  }
  return fallback;
}