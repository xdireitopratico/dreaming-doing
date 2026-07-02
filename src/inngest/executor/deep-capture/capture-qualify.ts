import type { AgentLlmCallFn } from "../browser-agent-llm";
import type { CaptureQualification } from "../browser-agent-state";

export type CaptureQualificationResult = CaptureQualification & {
  worthKeeping: boolean;
  notes?: string;
};

export type QualifyCaptureInput = {
  pageUrl: string;
  pngBase64: string;
  segmentIndex?: number;
  scrollY?: number;
  categories: string[];
};

const MAX_QUALIFY_IMAGE_CHARS = 80_000;

const SECTION_TYPES = [
  "hero",
  "features",
  "pricing",
  "testimonials",
  "cta",
  "footer",
  "nav",
  "unknown",
] as const;

export function guessSectionTypeHeuristic(segmentIndex: number, scrollY: number): string {
  if (segmentIndex === 0 || scrollY === 0) return "hero";
  return "unknown";
}

function toDataUrl(pngBase64: string): string {
  const raw = pngBase64.replace(/^data:image\/\w+;base64,/, "");
  return `data:image/png;base64,${raw}`;
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

function normalizeSectionType(value: unknown, fallback: string): string {
  const s = String(value ?? fallback).toLowerCase();
  return SECTION_TYPES.includes(s as (typeof SECTION_TYPES)[number]) ? s : fallback;
}

export function heuristicQualification(input: QualifyCaptureInput): CaptureQualificationResult {
  const sectionType = guessSectionTypeHeuristic(input.segmentIndex ?? 0, input.scrollY ?? 0);
  const fold = (input.segmentIndex ?? 0) + 1;
  const label =
    sectionType === "hero"
      ? `Hero — ${input.pageUrl}`
      : `Page fold ${fold} @ ${input.scrollY ?? 0}px`;
  return {
    worthKeeping: true,
    label,
    sectionType,
    confidence: 0.45,
    notes: "heuristic qualification (no vision)",
  };
}

export async function qualifyCaptureWithLlm(
  callLlm: AgentLlmCallFn,
  input: QualifyCaptureInput,
): Promise<CaptureQualificationResult> {
  const candidate = guessSectionTypeHeuristic(input.segmentIndex ?? 0, input.scrollY ?? 0);
  const systemPrompt = `Você qualifica prints de viewport para uma biblioteca de Design DNA (estilo Refero).
Analise se o frame merece ser guardado: conteúdo visual útil, seção identificável, valor para as categorias pedidas.
Rejeite (worthKeeping=false) apenas frames em branco, erro, loading vazio ou duplicata inútil.

Tipos de seção: ${SECTION_TYPES.join(", ")}.

Responda APENAS JSON:
{"worthKeeping":boolean,"label":string,"sectionType":string,"confidence":number,"notes":string}`;

  const userContent = `URL: ${input.pageUrl}
ScrollY: ${input.scrollY ?? 0}
Segment index: ${input.segmentIndex ?? 0}
Candidato heurístico: ${candidate}
Categorias do job: ${input.categories.join(", ")}`;

  const dataUrl = toDataUrl(input.pngBase64);
  const screenshot = dataUrl.length <= MAX_QUALIFY_IMAGE_CHARS ? dataUrl : "";

  try {
    const response = await callLlm(systemPrompt, userContent, screenshot);
    const parsed = safeJsonParse(response.content);
    if (!parsed) return heuristicQualification(input);

    return {
      worthKeeping: parsed.worthKeeping !== false,
      label: String(parsed.label ?? heuristicQualification(input).label).slice(0, 200),
      sectionType: normalizeSectionType(parsed.sectionType, candidate),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.6))),
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 500) : undefined,
    };
  } catch {
    return heuristicQualification(input);
  }
}

export type QualifyCaptureFn = (input: QualifyCaptureInput) => Promise<CaptureQualificationResult>;