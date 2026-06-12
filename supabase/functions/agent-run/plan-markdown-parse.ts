// plan-markdown-parse.ts — Fallback quando o LLM cola plano em markdown sem chamar create_plan.

import type { PlanStep, PlanStepType } from "./types.ts";

/** Âncoras ## que indicam plano (canônico FORGE, documento ou informal tipo c0416192). */
const PLAN_ANCHOR_RE =
  /^##\s+(Missão|Objetivo|Abordagem|Premissas|Fases|Fora do escopo|Entregas|Princípio|Estado\s+[Aa]tual|Próximos\s+[Pp]assos)/im;

export type ParsedPlanMarkdown = {
  summary: string;
  mission?: string;
  objective?: string;
  rationale?: string;
  assumptions?: string[];
  outOfScope?: string[];
  steps: Array<{ id?: string; description: string; type?: PlanStepType }>;
};

function sectionBody(text: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const m = text.match(re);
  return m?.[1]?.trim() ?? "";
}

function sectionBodyFlexible(text: string, headingPattern: RegExp): string {
  const re = new RegExp(
    `##\\s*(?:${headingPattern.source})[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`,
    "i",
  );
  return text.match(re)?.[1]?.trim() ?? "";
}

function subsectionBodyFlexible(text: string, headingPattern: RegExp): string {
  const re = new RegExp(
    `###\\s*(?:${headingPattern.source})[^\\n]*\\n([\\s\\S]*?)(?=\\n###\\s+|\\n##\\s+|$)`,
    "i",
  );
  return text.match(re)?.[1]?.trim() ?? "";
}

function planTitleFromHeading(text: string): string | null {
  const m = text.match(/^##\s+(.+)$/im);
  return m?.[1]?.trim() ?? null;
}

function bulletsFromSection(section: string): string[] {
  const items: string[] = [];
  for (const line of section.split("\n")) {
    const t = line.trim();
    const check = t.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
    if (check?.[1]) {
      items.push(check[1].trim());
      continue;
    }
    const bullet = t.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) items.push(bullet[1].trim());
  }
  return items;
}

function stepsFromPhases(text: string): string[] {
  const phasesBlock = sectionBody(text, "Fases");
  if (!phasesBlock) return [];

  const steps: string[] = [];
  const segments = phasesBlock.split(/^###\s+/m).filter(Boolean);

  for (const segment of segments) {
    for (const line of segment.split("\n")) {
      const t = line.trim();
      const check = t.match(/^[-*]\s+\[[ xX]\]\s+(.+)$/);
      if (check?.[1]) steps.push(check[1].trim());
    }
  }

  return steps;
}

function numberedSteps(text: string): string[] {
  const steps: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^\d+[.)]\s+(.+)$/);
    if (m?.[1]) steps.push(m[1].trim());
  }
  return steps;
}

function collectPlanStepDescriptions(text: string): string[] {
  const fromPhases = stepsFromPhases(text);
  if (fromPhases.length >= 2) return fromPhases;

  const fromEntregas = bulletsFromSection(sectionBodyFlexible(text, /Entregas/));
  if (fromEntregas.length >= 2) return fromEntregas;

  const fromFalta = numberedSteps(subsectionBodyFlexible(text, /Falta fazer/i));
  if (fromFalta.length >= 2) return fromFalta;

  const fromNumbered = numberedSteps(text);
  if (fromNumbered.length >= 2) return fromNumbered;

  const flat = bulletsFromSection(text);
  if (flat.length >= 2) return flat;

  return fromPhases.length ? fromPhases : fromNumbered;
}

/** Detecta markdown de plano FORGE — canônico, documento ou informal; não conversa casual. */
export function isPlanShapedMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 80) return false;
  if (!PLAN_ANCHOR_RE.test(t)) return false;

  const hasCanonicalMission = /^##\s+Missão/im.test(t);
  const hasPhases = /^##\s+Fases/im.test(t);
  const checklistCount = (t.match(/^[-*]\s+\[[ xX]\]/gm) ?? []).length;
  const stepCount = collectPlanStepDescriptions(t).length;

  if (hasCanonicalMission) {
    return hasPhases || checklistCount >= 2 || stepCount >= 2;
  }

  return stepCount >= 2 || checklistCount >= 2;
}

/** Extrai estrutura de plano a partir de markdown colado pelo LLM. */
export function parsePlanFromMarkdown(text: string): ParsedPlanMarkdown | null {
  const raw = text.trim();
  if (!isPlanShapedMarkdown(raw)) return null;

  const missionBlock = sectionBody(raw, "Missão");
  const estadoBlock = sectionBodyFlexible(raw, /Estado\s+[Aa]tual/);
  const titleFromHeading = planTitleFromHeading(raw);
  const mission =
    missionBlock ||
    titleFromHeading ||
    estadoBlock
      .split("\n")
      .find((line) => {
        const t = line.trim();
        return t && !t.startsWith("|") && !t.startsWith("###");
      })
      ?.trim() ||
    "";

  const objective = sectionBody(raw, "Objetivo");
  const rationale =
    sectionBody(raw, "Abordagem") ||
    sectionBodyFlexible(raw, /Princípio/) ||
    subsectionBodyFlexible(raw, /Resultado esperado/i);

  let assumptions = bulletsFromSection(sectionBody(raw, "Premissas"));
  if (!assumptions.length) {
    assumptions = bulletsFromSection(subsectionBodyFlexible(raw, /J[aá]\s+feito/i));
  }
  if (!assumptions.length && estadoBlock) {
    assumptions = bulletsFromSection(estadoBlock);
  }

  const outOfScope = bulletsFromSection(sectionBody(raw, "Fora do escopo"));

  const descriptions = collectPlanStepDescriptions(raw);
  if (descriptions.length < 2) return null;

  const summary =
    missionBlock.split("\n")[0]?.trim() ||
    titleFromHeading ||
    objective.split("\n")[0]?.trim() ||
    descriptions[0]?.slice(0, 120) ||
    "Plano proposto";

  const steps = descriptions.slice(0, 7).map((description, i) => ({
    description,
    type: "custom" as PlanStepType,
    id: `s${i + 1}`,
  }));

  return {
    summary,
    mission: mission || summary,
    objective: objective || undefined,
    rationale: rationale || undefined,
    assumptions: assumptions.length ? assumptions : undefined,
    outOfScope: outOfScope.length ? outOfScope : undefined,
    steps,
  };
}

/** Converte parse em args compatíveis com proposedPlanFromToolArgs. */
export function planToolArgsFromMarkdown(
  text: string,
): Record<string, unknown> | null {
  const parsed = parsePlanFromMarkdown(text);
  if (!parsed) return null;
  return {
    summary: parsed.summary,
    mission: parsed.mission,
    objective: parsed.objective,
    rationale: parsed.rationale,
    assumptions: parsed.assumptions,
    outOfScope: parsed.outOfScope,
    steps: parsed.steps.map((s) => ({
      id: s.id,
      type: s.type ?? "custom",
      description: s.description,
    })),
  };
}