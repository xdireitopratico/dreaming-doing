import type { BrowserAgentContext, AgentAction } from "./browser-agent-state";
import { formatStepsForPrompt } from "./browser-agent-state";

/** Vision-capable LLM call — system + user text + optional screenshot (G4). */
export type AgentLlmCallFn = (
  systemPrompt: string,
  userContent: string,
  screenshot: string,
) => Promise<{ content: string }>;

export type AgentPlan = {
  thought: string;
  action: AgentAction;
  done: boolean;
  dnaPartial?: Record<string, unknown>;
};

export function buildAgentPrompt(ctx: BrowserAgentContext, screenshotBase64?: string): string {
  const toolList = [
    { name: "navigate", params: { url: "string" }, use: "ir para uma URL" },
    { name: "screenshot", params: { fullPage: "boolean (opcional)" }, use: "capturar tela do viewport" },
    { name: "scroll", params: { y: "number" }, use: "scrollar para posição Y" },
    { name: "click", params: { selector: "string" }, use: "clicar em elemento" },
    { name: "type", params: { selector: "string", text: "string" }, use: "digitar em input" },
    { name: "analyze", params: { selector: "string" }, use: "extrair tag/texto/rect/styles de um elemento" },
    { name: "evaluate", params: { expression: "string" }, use: "executar JS arbitrário e retornar valor" },
    { name: "get_url", params: {}, use: "saber URL atual" },
  ];

  const pendingInstructions = ctx.instructions.filter((i) => i.status === "pending");

  return `Você é um agente de design que explora sites no browser para extrair Design DNA de alta qualidade.

OBJETIVO: analisar ${ctx.url} nas categorias: ${ctx.categories.join(", ")}.

FERRAMENTAS CDP disponíveis (escolha UMA por ciclo):
${toolList.map((t) => `- ${t.name}: ${JSON.stringify(t.params)} — ${t.use}`).join("\n")}

INSTRUÇÕES DO USUÁRIO:
${pendingInstructions.map((i) => `- ${i.role}: ${i.content}`).join("\n") || "Nenhuma."}

HISTÓRICO DE PASSOS:
${formatStepsForPrompt(ctx.steps)}

REGRAS:
- Sempre retorne JSON válido com: thought (string), action (objeto {type, params}), done (boolean), dna_partial (opcional).
- Se já tiver evidências suficientes, use done=true e preencha dna_partial com layout, color, typography, motion, interaction, component.
- Priorize qualidade sobre velocidade. Use screenshots e analyze para confirmar observações.
- Se o usuário pediu para focar/ignorar algo, ajuste seu plano.
- NUNCA invente informação que não observou.
${screenshotBase64 ? `\nScreenshot atual em base64 anexado à mensagem do usuário.` : ""}

Responda APENAS com o JSON.`;
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const codeMatch = text.match(/\`\`\`(?:json)?\s*({[\s\S]*?})\s*\`\`\`/);
    if (codeMatch) {
      try {
        return JSON.parse(codeMatch[1]);
      } catch {
        return null;
      }
    }
    const jsonMatch = text.match(/{[\s\S]*}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function normalizeAction(raw: unknown): AgentAction {
  const a = raw as Record<string, unknown> | undefined;
  if (!a || typeof a !== "object") return { type: "done", params: {} };
  const type = String(a.type ?? "done");
  const params = (a.params ?? {}) as Record<string, unknown>;

  switch (type) {
    case "navigate":
      return { type: "navigate", params: { url: String(params.url ?? "") } };
    case "screenshot":
      return { type: "screenshot", params: { fullPage: params.fullPage === true } };
    case "scroll":
      return { type: "scroll", params: { y: Number(params.y ?? 0) } };
    case "click":
      return { type: "click", params: { selector: String(params.selector ?? "") } };
    case "type":
      return { type: "type", params: { selector: String(params.selector ?? ""), text: String(params.text ?? "") } };
    case "analyze":
      return { type: "analyze", params: { selector: String(params.selector ?? "") } };
    case "evaluate":
      return { type: "evaluate", params: { expression: String(params.expression ?? "") } };
    case "get_url":
      return { type: "get_url", params: {} };
    default:
      return { type: "done", params: {} };
  }
}

export async function runAgentPlanningStep(
  ctx: BrowserAgentContext,
  callLlm: AgentLlmCallFn,
  screenshotBase64?: string,
): Promise<AgentPlan> {
  const systemPrompt = buildAgentPrompt(ctx, screenshotBase64);
  const screenshot =
    screenshotBase64?.startsWith("data:") ? screenshotBase64 : "";

  const response = await callLlm(systemPrompt, "Qual o próximo passo?", screenshot);
  const parsed = safeJsonParse(response.content);

  if (!parsed) {
    return {
      thought: "Não foi possível parsear a resposta do LLM. Finalizando com síntese do material coletado.",
      action: { type: "done", params: {} },
      done: true,
    };
  }

  const action = normalizeAction(parsed.action);
  const done = parsed.done === true || action.type === "done";
  const dnaPartial = typeof parsed.dna_partial === "object" && parsed.dna_partial !== null
    ? (parsed.dna_partial as Record<string, unknown>)
    : undefined;

  return {
    thought: String(parsed.thought ?? ""),
    action,
    done,
    dnaPartial,
  };
}
