// plan-markdown-parse.ts — Fallback quando o LLM cola plano em markdown sem chamar create_plan.

import type { PlanStep, PlanStepType } from "./types.ts";

const PLAN_SECTION_RE = /^##\s+(Missão|Objetivo|Abordagem|Premissas|Fases|Fora do escopo)\s*$/im;
const PHASE_HEADING_RE = /^###\s+(.+)$/gm;
const CHECKLIST_RE = /^[-*]\s+\[[ xX]\]\s+(.+)$/gm;
const BULLET_RE = /^[-*]\s+(.+)$/gm;

export type ParsedPlanMarkdown = {
  summary: string;
  mission?: string;
  objective?: string;
  rationale?: string;
  assumptions?: string[];
  outOfScope?: string[];
  steps: Array<{ description: string; type?: PlanStepType }>;
};

function sectionBody(text: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const m = text.match(re);
  return m?.[1]?.trim() ?? "";
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
    const lines = segment.split("\n");
    for (const line of lines) {
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

/** Detecta markdown de plano FORGE (## Missão + passos), não conversa casual. */
export function isPlanShapedMarkdown(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 80) return false;
  if (!PLAN_SECTION_RE.test(t)) return false;

  const hasMission = /^##\s+Missão/im.test(t);
  const hasPhases = /^##\s+Fases/im.test(t);
  const stepCandidates = [...stepsFromPhases(t), ...numberedSteps(t)];
  const checklistCount = (t.match(/^[-*]\s+\[[ xX]\]/gm) ?? []).length;

  return hasMission && (hasPhases || checklistCount >= 2 || stepCandidates.length >= 2);
}

/** Extrai estrutura de plano a partir de markdown colado pelo LLM. */
export function parsePlanFromMarkdown(text: string): ParsedPlanMarkdown | null {
  const raw = text.trim();
  if (!isPlanShapedMarkdown(raw)) return null;

  const mission = sectionBody(raw, "Missão");
  const objective = sectionBody(raw, "Objetivo");
  const rationale = sectionBody(raw, "Abordagem");
  const assumptions = bulletsFromSection(sectionBody(raw, "Premissas"));
  const outOfScope = bulletsFromSection(sectionBody(raw, "Fora do escopo"));

  let descriptions = stepsFromPhases(raw);
  if (descriptions.length < 2) {
    descriptions = numberedSteps(raw);
  }
  if (descriptions.length < 2) {
    const flat = bulletsFromSection(raw);
    if (flat.length >= 2) descriptions = flat;
  }
  if (descriptions.length < 2) return null;

  const summary =
    mission.split("\n")[0]?.trim() ||
    objective.split("\n")[0]?.trim() ||
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