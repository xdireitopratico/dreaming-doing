import type { AgentObservation, BrowserAgentStep } from "./browser-agent-state";
import type { AgentLlmCallFn } from "./browser-agent-llm";

const MAX_SYNTHESIS_SCREENSHOT_CHARS = 120_000;

/** Evita embutir PNG base64 no prompt de texto (estoura contexto do LLM). */
export function sanitizeObservationForEvidence(obs: AgentObservation): Record<string, unknown> {
  const copy = { ...obs } as Record<string, unknown>;
  if (typeof copy.screenshot === "string" && copy.screenshot.length > 80) {
    copy.screenshot = `[screenshot omitted, ${copy.screenshot.length} chars]`;
  }
  if (copy.result && typeof copy.result === "object" && copy.result !== null) {
    const result = { ...(copy.result as Record<string, unknown>) };
    if (typeof result.base64 === "string" && result.base64.length > 80) {
      result.base64 = `[base64 omitted, ${result.base64.length} chars]`;
    }
    copy.result = result;
  }
  return copy;
}

export type SynthesizedDNA = {
  name: string;
  source_url: string;
  category: string;
  layout: Record<string, unknown> | null;
  color: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
  motion: Record<string, unknown> | null;
  interaction: Record<string, unknown> | null;
  component: Record<string, unknown> | null;
  implementation_notes: string | null;
  quality_score: number;
  quality_source: string;
  serves_domains: string[];
  compatible_languages: string[];
  compatible_moods: string[];
  extracted_at: string;
};

function resolveSynthesisScreenshot(steps: BrowserAgentStep[]): string {
  const shot = [...steps].reverse().find((s) => s.observation.screenshot);
  if (!shot?.observation.screenshot) return "";
  const raw = shot.observation.screenshot;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

export function buildSynthesisPrompt(
  url: string,
  categories: string[],
  steps: BrowserAgentStep[],
): string {
  const evidence = steps
    .map(
      (s) =>
        `Step ${s.stepNumber}: ${s.thought}\nAction: ${s.action.type}\nObservation: ${JSON.stringify(
          sanitizeObservationForEvidence(s.observation),
        )}`,
    )
    .join("\n\n");

  return `Você é um síntese de Design DNA. Recebeu evidências coletadas por um agente de browser.

SITE: ${url}
CATEGORIAS SOLICITADAS: ${categories.join(", ")}

EVIDÊNCIAS:
${evidence}

TAREFA: produza UM JSON válido com:
- name: nome do site
- category: uma categoria principal
- layout, color, typography, motion, interaction, component: objetos detalhados
- implementation_notes: string com observações técnicas
- quality_score: 0-10
- quality_source: "deep_agent"
- serves_domains, compatible_languages, compatible_moods: arrays de strings

Seja específico. Cite classes, cores hex, fontes, animações observadas. Não invente o que não está nas evidências.`;
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const codeMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
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

export async function synthesizeDesignDNA(
  steps: BrowserAgentStep[],
  url: string,
  categories: string[],
  callLlm: AgentLlmCallFn,
): Promise<SynthesizedDNA> {
  const prompt = buildSynthesisPrompt(url, categories, steps);
  const rawScreenshot = resolveSynthesisScreenshot(steps);
  const screenshot =
    rawScreenshot.length > MAX_SYNTHESIS_SCREENSHOT_CHARS ? "" : rawScreenshot;
  const response = await callLlm(prompt, "Sintetize o Design DNA final.", screenshot);

  const parsed = safeJsonParse(response.content) ?? {};

  const now = new Date().toISOString();
  return {
    name: String(parsed.name ?? url),
    source_url: url,
    category: String(parsed.category ?? "full_page"),
    layout: (parsed.layout as Record<string, unknown>) ?? null,
    color: (parsed.color as Record<string, unknown>) ?? null,
    typography: (parsed.typography as Record<string, unknown>) ?? null,
    motion: (parsed.motion as Record<string, unknown>) ?? null,
    interaction: (parsed.interaction as Record<string, unknown>) ?? null,
    component: (parsed.component as Record<string, unknown>) ?? null,
    implementation_notes: String(parsed.implementation_notes ?? "") || null,
    quality_score: Math.min(10, Math.max(0, Number(parsed.quality_score ?? 7))),
    quality_source: "deep_agent",
    serves_domains: Array.isArray(parsed.serves_domains) ? (parsed.serves_domains as string[]) : [],
    compatible_languages: Array.isArray(parsed.compatible_languages)
      ? (parsed.compatible_languages as string[])
      : [],
    compatible_moods: Array.isArray(parsed.compatible_moods) ? (parsed.compatible_moods as string[]) : [],
    extracted_at: now,
  };
}
