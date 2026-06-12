// narration.ts — Chat 100% LLM. Zero template hardcoded voltado ao usuário.
//
// 1. Abertura — primeira resposta humana após o pedido
// 2. Loop     — atualizações ao vivo durante execução
// 3. Fechamento — mensagem final de entrega

import type { LLMProvider } from "./types.ts";
import type { ClassificationResult } from "./router.ts";

export type CommunicationPhase = "opening" | "loop" | "closure";

const CHAT_VOICE = `Você é o parceiro de vibe-coding do FORGE — linguagem simples, calor humano, português direto.
Três obrigações: (1) esclarecer em frases curtas, (2) interpretar a intenção por trás do pedido, (3) contribuir com próximo passo ou entrega concreta.
Fale como colega de time num chat. 1–4 frases curtas.
Proibido: emojis (nenhum 🙂😊 etc.), repetir a mesma frase mais de uma vez, "explorando o projeto", "indexando arquivos", listas numeradas de passos, jargão de pipeline ("classify", "fase", "orquestrador"), tom robótico.`;

type LlmLineOpts = {
  max_tokens?: number;
  temperature?: number;
  minLength?: number;
  retries?: number;
};

/** Chamada LLM com retry — retorna null se o modelo falhar (sem fallback de template). */
export async function llmChatLine(
  model: LLMProvider,
  system: string,
  user: string,
  opts?: LlmLineOpts,
): Promise<string | null> {
  const retries = opts?.retries ?? 2;
  const minLength = opts?.minLength ?? 8;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await model.chat({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: opts?.max_tokens ?? 280,
        temperature: opts?.temperature ?? 0.45,
      });
      const text = (resp.content ?? "").trim();
      if (text.length >= minLength) return text;
    } catch {
      /* retry */
    }
  }
  return null;
}

// ─── 1. ABERTURA ───────────────────────────────────────────────────────────

export type OpeningContext = {
  userSummary: string;
  intentType?: ClassificationResult["type"];
  planMode?: boolean;
  approvedPlan?: boolean;
  planHeadline?: string;
};

export type OpeningLLMContext = OpeningContext & {
  userRequest: string;
};

const OPENING_SYSTEM = `${CHAT_VOICE}

O usuário acabou de enviar um pedido. Confirme o que entendeu e diga o que vai fazer agora.`;

export async function generateOpeningMessage(
  model: LLMProvider,
  ctx: OpeningLLMContext,
): Promise<string | null> {
  const request = ctx.userRequest?.trim() || ctx.userSummary?.trim() || "pedido do usuário";
  const mode = ctx.approvedPlan
    ? "executar plano já aprovado"
    : ctx.planMode
      ? "propor plano antes de codar"
      : "implementar em build";

  return llmChatLine(
    model,
    OPENING_SYSTEM,
    [
      `Pedido do usuário:\n${request}`,
      `Resumo interno: ${ctx.userSummary?.trim() || request}`,
      `Intenção: ${ctx.intentType ?? "other"}`,
      `Modo: ${mode}`,
      ctx.planHeadline ? `Plano: ${ctx.planHeadline}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    { max_tokens: 320, minLength: 12 },
  );
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

const LOOP_SYSTEM = `${CHAT_VOICE}

Você comenta o progresso ao vivo no chat — uma frase ou duas, sem repetir o que já disse.`;

function loopUserPrompt(ctx: LoopUpdateContext): string {
  const base = ctx.userRequest?.trim()
    ? `Pedido do usuário: ${ctx.userRequest.trim()}\n`
    : "";
  const touched =
    ctx.touchedPaths?.length ?
      `Arquivos já tocados: ${ctx.touchedPaths.slice(-6).join(", ")}\n`
    : "";

  switch (ctx.kind) {
    case "processing":
      return `${base}${touched}Momento: o modelo está demorando. Avise que ainda está trabalhando, sem inventar detalhes.`;

    case "resume":
      if (ctx.fixResume) {
        return `${base}${touched}Momento: retomou para corrigir erros de build.`;
      }
      if (ctx.resumeStep && ctx.total) {
        return `${base}${touched}Momento: retomou do passo ${ctx.resumeStep} de ${ctx.total}.`;
      }
      return `${base}${touched}Momento: retomou de onde parou.`;

    case "tool_batch": {
      const tools = (ctx.tools ?? [])
        .map((t) => `${t.name}(${JSON.stringify(t.arguments).slice(0, 160)})`)
        .join("\n");
      return `${base}${touched}Momento: acabou de rodar ferramentas.\nFerramentas:\n${tools || "(nenhuma)"}\nSucesso geral: ${ctx.allOk !== false}\nPasso: ${ctx.step ?? "?"} / ${ctx.total ?? "?"}`;
    }

    case "typecheck_fail":
      return `${base}${touched}Momento: TypeScript apontou erro no que acabou de mexer — vai corrigir.`;

    case "build_check":
      return `${base}${touched}Momento: vai conferir se o projeto compila.`;

    case "build_ok":
      return `${base}${touched}Momento: build passou, segue para o próximo passo.`;

    case "stuck":
      return `${base}${touched}Momento: percebeu repetição — vai mudar de abordagem.`;

    case "build_fix":
      return `${base}${touched}Momento: build ainda falhou — vai corrigir antes de entregar.`;

    case "model_error":
      return `${base}Momento: erro temporário no modelo (${ctx.errorDetail ?? "falha de API"}). Vai tentar de novo em instantes.`;

    default:
      return `${base}${touched}Momento: progresso da execução.`;
  }
}

export async function generateLoopUpdate(
  model: LLMProvider,
  ctx: LoopUpdateContext,
): Promise<string | null> {
  if (ctx.kind === "tool_batch" && !(ctx.tools?.length)) return null;
  return llmChatLine(model, LOOP_SYSTEM, loopUserPrompt(ctx), {
    max_tokens: 180,
    minLength: 8,
    temperature: 0.5,
  });
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

const CLOSURE_SYSTEM = `${CHAT_VOICE}

Mensagem final curta: o que entregou, em quais arquivos (se houver), peça para conferir o preview.
Não repita a conversa anterior.`;

export type ResolvedClosure = {
  text: string;
  emitExtra: boolean;
  extraText?: string;
};

function closureUserPrompt(ctx: ClosureContext): string {
  const files = (ctx.touchedPaths ?? []).slice(-10).map((p) => `- ${p}`).join("\n");
  const prior = (ctx.priorConversation ?? "").slice(0, 900);

  if (ctx.errorMessage?.trim()) {
    return [
      `Pedido: ${ctx.userRequest?.trim() || "(não informado)"}`,
      `Situação: erro na execução`,
      `Erro: ${ctx.errorMessage.trim()}`,
      files ? `Arquivos tocados:\n${files}` : "",
      prior ? `Conversa anterior (não repetir):\n${prior}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (ctx.silentResume) {
    return [
      `Pedido: ${ctx.userRequest?.trim() || "(não informado)"}`,
      `Situação: execução longa ainda em andamento`,
      files ? `Arquivos já tocados:\n${files}` : "",
      prior ? `Conversa anterior (não repetir):\n${prior}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (ctx.partial) {
    return [
      `Pedido: ${ctx.userRequest?.trim() || "(não informado)"}`,
      `Situação: pausa parcial — pode continuar depois`,
      files ? `Arquivos tocados até aqui:\n${files}` : "",
      prior ? `Conversa anterior (não repetir):\n${prior}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    `Pedido: ${ctx.userRequest?.trim() || "(não informado)"}`,
    files ? `Arquivos alterados:\n${files}` : "Nenhum arquivo alterado.",
    prior ? `Conversa anterior (não repetir):\n${prior}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function generateClosureMessage(
  model: LLMProvider,
  ctx: ClosureContext,
): Promise<ResolvedClosure> {
  const closing = await llmChatLine(model, CLOSURE_SYSTEM, closureUserPrompt(ctx), {
    max_tokens: 360,
    minLength: 16,
    temperature: 0.4,
  });

  if (!closing) {
    return { text: "", emitExtra: false };
  }

  return { text: closing, emitExtra: true, extraText: closing };
}