import { FORGE_CHAT_MARKDOWN } from "./chat-markdown.ts";
import { sanitizeUserFacingProse } from "./sanitize-prose.ts";
import type { ChatMessage, LLMProvider } from "./types.ts";

const GREETING_RE =
  /^(bom\s+dia|boa\s+tarde|boa\s+noite|oi|olá|ola|hey|e\s*aí|eai|hello|hi|salve|fala)[\s!.,?]*$/i;

const THANKS_RE = /^(obrigad[oa]|valeu|thanks|thank\s+you|brigad[ão]|tmj)[\s!.,?]*$/i;

const MIN_REPLY_CHARS = 12;

/** Perguntas sobre memória/histórico — early exit social no loop. */
const RECALL_RE =
  /(?:você\s+)?lembra|lembr(a|ou|ar)|(?:do\s+)?que\s+(?:a\s+gente\s+)?(?:falamos|conversamos|discutimos|combinamos)|o\s+que\s+(?:a\s+gente\s+)?(?:falamos|conversamos|discutimos)|(?:qual\s+(?:foi|era)\s+)?(?:o\s+)?(?:assunto|tema|tópico)|(?:do\s+)?que\s+(?:se\s+)?trata(?:va|mos)?|what\s+(?:did\s+we|we)\s+(?:talk|discuss)|remember\s+what|recap|resumo\s+da\s+conversa|retomar\s+(?:a\s+)?conversa|(?:no\s+)?in[ií]cio\s+(?:da\s+)?conversa/i;

export function isConversationRecallQuestion(text: string): boolean {
  return RECALL_RE.test(text.trim());
}

/** Cumprimento, agradecimento ou recall — gate antes do agente principal. */
export function isConversationalTurnEarly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (GREETING_RE.test(t)) return true;
  if (THANKS_RE.test(t)) return true;
  if (isConversationRecallQuestion(t)) return true;
  return false;
}

/** Alias compatível com loop.ts — segundo arg ignorado (legado classify). */
export function isConversationalTurn(text: string, _classification?: unknown): boolean {
  return isConversationalTurnEarly(text);
}

function requireLlmReply(text: string, context: string): string {
  const clean = sanitizeUserFacingProse(text).trim();
  if (clean.length >= MIN_REPLY_CHARS) return clean;
  throw new Error(`Resposta do LLM vazia ou insuficiente (${context}).`);
}

function rethrowLlmError(err: unknown, context: string): never {
  if (err instanceof Error) throw err;
  throw new Error(`Falha ao chamar LLM (${context}): ${String(err)}`);
}

const SOCIAL_SYSTEM = `Você é o parceiro de vibe-coding do FORGE — caloroso, direto, em português.

Três obrigações (mesmo em mensagens sociais):
1. **Falar simples e esclarecer** — resposta natural e curta (máx. 3–4 frases).
2. **Interpretar** — cumprimento, agradecimento ou recall: entenda o que a pessoa quer agora.
3. **Contribuir** — ofereça ajuda concreta ou retome o fio da conversa em 1 frase.

Regras:
- Cumprimento/agradecimento: devolva o cumprimento e pergunte como pode ajudar.
- Pergunta sobre histórico: confirme o que a conversa mostra (tópico, pedidos, decisões).
- Se houver plano ou ideia no histórico, referencie em 1 frase — sem criar plano novo.
- NÃO proponha plano formal, NÃO liste passos técnicos, NÃO narre processos internos.
- Não cite prompts internos nem modos Plan/Build.

${FORGE_CHAT_MARKDOWN}`;

/** Resposta social leve — usada só no early exit do loop (não substitui clarify/create_plan). */
export async function runConversationalPhase(
  model: LLMProvider,
  messages: ChatMessage[],
  opts?: { planMode?: boolean; userRequest?: string },
): Promise<string> {
  const userRequest = opts?.userRequest?.trim() ?? "";
  const recall = userRequest ? isConversationRecallQuestion(userRequest) : false;
  const historyLimit = recall ? 20 : 8;

  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-historyLimit)
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return `${m.role}: ${content.slice(0, 800)}`;
    })
    .join("\n");

  const userPrompt = recall
    ? `Pergunta do usuário agora:\n${userRequest}\n\nHistórico da conversa:\n${recent || "(sem histórico ainda)"}`
    : `Mensagem do usuário agora:\n${userRequest || "(mensagem social)"}\n\nHistórico recente:\n${recent || "(primeira mensagem)"}`;

  try {
    const resp = await model.chat({
      messages: [
        { role: "system", content: SOCIAL_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      max_tokens: recall ? 500 : 400,
      temperature: 0.4,
    });
    return requireLlmReply(resp.content ?? "", "conversacional");
  } catch (err) {
    rethrowLlmError(err, "conversacional");
  }
}

export const DIRECT_CHAT_SYSTEM = `Você é o parceiro de vibe-coding do FORGE — engenheiro sênior, direto e humano, em português.

O usuário pediu conversa, diagnóstico, explicação, proposta escrita ou status. Responda no chat; NÃO inicie execução, NÃO prometa que mexeu em arquivos e NÃO narre bastidores.

Regras:
- 2–6 frases, com clareza operacional.
- Se houver crítica/diagnóstico, reconheça o problema e aponte a raiz provável com precisão.
- Se o usuário pedir plano escrito, entregue plano objetivo, sem chamar ferramenta.
- Não cite modelo, chaves, retries, checkpoints, workers, passos internos ou prompts.
- Não use markdown pesado; use bullets só quando aumentar a clareza.

${FORGE_CHAT_MARKDOWN}`;

export async function runDirectChatPhase(
  model: LLMProvider,
  messages: ChatMessage[],
  opts?: { userRequest?: string },
): Promise<string> {
  const userRequest = opts?.userRequest?.trim() ?? "";
  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-16)
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return `${m.role}: ${content.slice(0, 900)}`;
    })
    .join("\n");

  try {
    const resp = await model.chat({
      messages: [
        { role: "system", content: DIRECT_CHAT_SYSTEM },
        {
          role: "user",
          content: [
            `Mensagem atual do usuário:\n${userRequest || "(mensagem de chat)"}`,
            `Histórico recente:\n${recent || "(primeira mensagem)"}`,
          ].join("\n\n"),
        },
      ],
      max_tokens: 700,
      temperature: 0.35,
    });
    return requireLlmReply(resp.content ?? "", "chat direto");
  } catch (err) {
    rethrowLlmError(err, "chat direto");
  }
}