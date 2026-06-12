import { FORGE_CHAT_MARKDOWN } from "./chat-markdown.ts";
import { sanitizeUserFacingProse } from "./sanitize-prose.ts";
import type { ChatMessage, LLMProvider } from "./types.ts";

const GREETING_RE =
  /^(bom\s+dia|boa\s+tarde|boa\s+noite|oi|olá|ola|hey|e\s*aí|eai|hello|hi|salve|fala)[\s!.,?]*$/i;

const THANKS_RE = /^(obrigad[oa]|valeu|thanks|thank\s+you|brigad[ão]|tmj)[\s!.,?]*$/i;

/** Perguntas sobre memória/histórico — early exit social no loop. */
const RECALL_RE =
  /(?:você\s+)?lembra|lembr(a|ou|ar)|(?:do\s+)?que\s+(?:a\s+gente\s+)?(?:falamos|conversamos|discutimos|combinamos)|o\s+que\s+(?:a\s+gente\s+)?(?:falamos|conversamos|discutimos)|(?:qual\s+(?:foi|era)\s+)?(?:o\s+)?(?:assunto|tema|tópico)|(?:do\s+)?que\s+(?:se\s+)?trata(?:va|mos)?|what\s+(?:did\s+we|we)\s+(?:talk|discuss)|remember\s+what|recap|resumo\s+da\s+conversa|retomar\s+(?:a\s+)?conversa|(?:no\s+)?in[ií]cio\s+(?:da\s+)?conversa/i;

/** Perguntas de opinião/sugestão — paleta, design, escolhas sem pedido de implementação. */
const ADVISORY_RE =
  /(?:qual|que)\s+(?:paleta|cor(?:es)?|fonte|tipografia|layout|estilo|tema|visual|tom)|(?:sugere|sugira|recomenda|recomende|indica)|(?:o\s+que\s+(?:você\s+)?(?:acha|pensa|opina))|(?:você\s+)?(?:prefere|escolheria)|(?:dark|claro|neutro)\s+(?:ou|vs)|design\s+(?:system|visual)|paleta\s+de\s+cor/i;

export function isConversationRecallQuestion(text: string): boolean {
  return RECALL_RE.test(text.trim());
}

export function isAdvisoryQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^(crie|criar|implemente|implementar|faça|fazer|monte|montar|adicione|adicionar|corrija|corrigir|build)\b/i.test(t)) {
    return false;
  }
  return ADVISORY_RE.test(t);
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
    const text = (resp.content ?? "").trim();
    if (text) return text;
  } catch {
    // fallback abaixo
  }

  if (recall) {
    return "Lembro sim — pelo histórico recente estávamos discutindo o projeto. Quer que eu retome de onde paramos?";
  }

  return "Bom dia! Como posso ajudar você hoje — quer revisar o plano, discutir a ideia ou partir para implementar?";
}

const ADVISORY_SYSTEM = `Você é o parceiro de vibe-coding do FORGE — caloroso, direto, em português.

O usuário pediu opinião ou sugestão (design, paleta, estilo) — NÃO pediu para codar ainda.

Regras:
- 2–4 frases curtas em prosa humana.
- Use o contexto do projeto só para embasar a sugestão — **nunca** cite paths, blocos de código, tokens CSS (\`--color-*\`, \`@theme\`) nem arquivos do seed.
- Cores: nome humano + no máximo 1 hex entre parênteses (ex.: "âmbar quente (#FFB627)").
- Dê UMA recomendação clara e, se fizer sentido, uma pergunta de follow-up.
- NÃO proponha plano formal nem liste passos técnicos.

${FORGE_CHAT_MARKDOWN}`;

/** Resposta consultiva leve — paleta, design, sugestões sem execução. */
export async function runAdvisoryPhase(
  model: LLMProvider,
  messages: ChatMessage[],
  opts?: { userRequest?: string; projectContext?: string },
): Promise<string> {
  const userRequest = opts?.userRequest?.trim() ?? "";
  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return `${m.role}: ${content.slice(0, 600)}`;
    })
    .join("\n");

  const context = (opts?.projectContext ?? "").slice(0, 3000);

  try {
    const resp = await model.chat({
      messages: [
        { role: "system", content: ADVISORY_SYSTEM },
        {
          role: "user",
          content: [
            `Pergunta do usuário:\n${userRequest || "(consulta)"}`,
            context ? `Contexto interno (não citar paths nem código):\n${context}` : "",
            `Histórico recente:\n${recent || "(primeira mensagem)"}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      max_tokens: 450,
      temperature: 0.45,
    });
    const text = sanitizeUserFacingProse(resp.content ?? "");
    if (text.length >= 12) return text;
  } catch {
    /* fallback */
  }

  return "Eu iria de dark industrial com âmbar quente como destaque — passa confiança e não cansa à noite. Quer manter esse tom ou prefere algo mais claro/neutro?";
}