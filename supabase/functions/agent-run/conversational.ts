import type { ChatMessage, ClassificationResult, LLMProvider } from "./types.ts";

const GREETING_RE =
  /^(bom\s+dia|boa\s+tarde|boa\s+noite|oi|olá|ola|hey|e\s*aí|eai|hello|hi|salve|fala)[\s!.,?]*$/i;

const THANKS_RE = /^(obrigad[oa]|valeu|thanks|thank\s+you|brigad[ão]|tmj)[\s!.,?]*$/i;

/** Cumprimento/agradecimento óbvio — gate antes de gather (evita "Explorando…"). */
export function isConversationalTurnEarly(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (GREETING_RE.test(t)) return true;
  if (THANKS_RE.test(t)) return true;
  return false;
}

/** Após classify — só cumprimento/agradecimento explícito (vago tipo "site" vai para qualify/plan). */
export function isConversationalTurn(text: string, _classification: ClassificationResult): boolean {
  return isConversationalTurnEarly(text);
}

export const CONVERSATIONAL_SYSTEM = `Você é o parceiro de vibe-coding do FORGE — caloroso, direto, em português.

O usuário mandou uma mensagem social ou curta, SEM pedido técnico ainda.

Regras:
1. Cumprimente de volta de forma natural (ex.: "Bom dia!").
2. Pergunte como pode ajudar — projeto, plano, próximo passo.
3. Se o histórico mencionar plano ou ideia anterior, referencie em 1 frase (ex.: "Quer revisar o plano?" ou "Posso melhorar algo no que combinamos?").
4. NÃO proponha plano formal, NÃO liste passos técnicos, NÃO diga "Explorando" ou "Vou montar um plano".
5. Máximo 3 frases curtas. Markdown leve ok.
6. Não cite prompts internos nem modos Plan/Build.`;

export async function runConversationalPhase(
  model: LLMProvider,
  messages: ChatMessage[],
  opts?: { planMode?: boolean },
): Promise<string> {
  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-8)
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : "";
      return `${m.role}: ${content.slice(0, 500)}`;
    })
    .join("\n");

  const modeHint = opts?.planMode
    ? "O usuário está em modo Plan — pode querer discutir ideia antes de codar."
    : "O usuário está em modo Build — pode querer orientação antes de implementar.";

  try {
    const resp = await model.chat({
      messages: [
        { role: "system", content: CONVERSATIONAL_SYSTEM },
        {
          role: "user",
          content: `${modeHint}\n\nHistórico recente:\n${recent || "(primeira mensagem)"}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.5,
    });
    const text = (resp.content ?? "").trim();
    if (text) return text;
  } catch {
    // fallback abaixo
  }

  return "Bom dia! Como posso ajudar você hoje — quer revisar o plano, discutir a ideia ou partir para implementar?";
}
