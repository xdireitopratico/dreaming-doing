import type { AgentComposerMode } from "@/lib/chat-types";

export type AgentRunMode = AgentComposerMode;

export type TurnIntent =
  | { kind: "chat"; runMode: "chat"; reason: string }
  | { kind: "plan"; runMode: "plan"; reason: string }
  | { kind: "build"; runMode: "build"; reason: string };

type ResolveTurnIntentInput = {
  text: string;
  composerMode: AgentComposerMode;
  explicitMode?: AgentComposerMode;
  hasAttachments?: boolean;
};

const HARD_CHAT_RE =
  /\b(?:não\s+(?:programe|execute|mexa|altere|edite|rode)|sem\s+(?:programar|executar|mexer|editar)|s[oó]\s+(?:responda|explica|explique|por\s+escrito)|proibido\s+programar|quero\s+por\s+escrito)\b/i;

const SOCIAL_RE =
  /^(?:bom\s+dia|boa\s+tarde|boa\s+noite|oi|ol[aá]|hello|hi|hey|salve|fala|obrigad[oa]|valeu|thanks|tmj)[\s!.,?]*$/i;

const QUESTION_RE =
  /^(?:o\s+que|qual|quais|quando|onde|como|por\s+que|porque|me\s+explica|explique|resuma|resume|mostra|mostre|quem)\b/i;

const CHAT_STATUS_RE =
  /\b(?:o\s+que\s+voc[eê]\s+fez|status|andamento|raiz\s+do\s+problema|diagn[oó]stico|relat[oó]rio|diff|evid[eê]ncias?|proposta|plano\s+de\s+solu[cç][aã]o|qualidade|fidelidade|lovable|timeline|ux|ui)\b/i;

const PLAN_RE =
  /\b(?:planeje|planejar|plano|proposta|estrat[eé]gia|roadmap|arquitetura|desenhe\s+o\s+plano|antes\s+de\s+executar)\b/i;

const BUILD_RE =
  /\b(?:pode\s+executar|executa|execute|implemente|implementa|corrija|corrigir|conserte|arrume|fa[cç]a|crie|criar|adicione|remova|delete|exclua|refatore|altere|mude|instale|rode|roda|build|deploy|commit|push|programar|codar|mexer\s+nos\s+arquivos)\b/i;

/** Pedido explícito de executar plano já aprovado — mesmo com composer em Plan. */
const EXECUTE_PLAN_RE =
  /\b(?:pode\s+executar|execut[ae]\s+o\s+plano|rodar\s+o\s+plano|implement[ae]\s+o\s+plano)\b/i;

export function isExplicitBuildRequest(text: string): boolean {
  return BUILD_RE.test(text.trim());
}

export function resolveTurnIntent(input: ResolveTurnIntentInput): TurnIntent {
  const text = input.text.trim();
  const requestedMode = input.explicitMode ?? input.composerMode;

  if (!text && !input.hasAttachments) {
    return { kind: "chat", runMode: "chat", reason: "empty" };
  }

  if (requestedMode === "chat") {
    if (isExplicitBuildRequest(text)) {
      return { kind: "chat", runMode: "chat", reason: "action_verb_in_chat_mode" };
    }
    return { kind: "chat", runMode: "chat", reason: "composer_chat_mode" };
  }

  if (HARD_CHAT_RE.test(text)) {
    return { kind: "chat", runMode: "chat", reason: "explicit_chat_only" };
  }

  if (SOCIAL_RE.test(text)) {
    return { kind: "chat", runMode: "chat", reason: "social" };
  }

  if (CHAT_STATUS_RE.test(text) || QUESTION_RE.test(text)) {
    return { kind: "chat", runMode: "chat", reason: "question_or_status" };
  }

  /** Composer Plan: default plan — não deixar BUILD_RE ("crie") roubar o modo. */
  if (requestedMode === "plan") {
    if (EXECUTE_PLAN_RE.test(text)) {
      return { kind: "build", runMode: "build", reason: "execute_in_plan_composer" };
    }
    return { kind: "plan", runMode: "plan", reason: "composer_plan_mode" };
  }

  if (BUILD_RE.test(text)) {
    return { kind: "build", runMode: "build", reason: "action_verb" };
  }

  if (input.hasAttachments && requestedMode === "build") {
    return { kind: "build", runMode: "build", reason: "attachment_build_mode" };
  }

  if (PLAN_RE.test(text)) {
    return { kind: "plan", runMode: "plan", reason: "plan_terms" };
  }

  if (text.length <= 280 && !/[.!?]?\s*(?:agora|hoje|nessa tela|nesse arquivo)\b/i.test(text)) {
    return { kind: "chat", runMode: "chat", reason: "short_non_action" };
  }

  return { kind: "build", runMode: "build", reason: "composer_build_default" };
}