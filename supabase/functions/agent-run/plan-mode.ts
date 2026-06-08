// plan-mode.ts — Plan mode (Fase 4.6): tipos + extração de plano a partir da classificação.
// Espelha src/components/editor/PlanViewer.tsx (PlanStep) — não altera o componente client.
import type { ProposedPlan } from "./types.ts";

export type PlanStepType =
  | "create_file"
  | "edit_file"
  | "shell_exec"
  | "install_dep"
  | "observe"
  | "custom";

export interface PlanStep {
  id: string;
  type: PlanStepType;
  description: string;
  filePath?: string;
  estimatedCost?: number;
  enabled: boolean;
}

/**
 * Plano estruturado produzido pelo LLM no classify.
 * `rationale` é a justificativa amigável em PT-BR (1-2 frases) —
 * o que o agente explica pra o usuário sobre a abordagem escolhida.
 * `steps` é a sequência concreta de ações (2-7 passos).
 */
export interface ForgePlanPhase {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
}

export interface PlanRationale {
  rationale: string;
  steps: PlanStep[];
  mission?: string;
  objective?: string;
  assumptions?: string[];
  outOfScope?: string[];
  phases?: ForgePlanPhase[];
}

export type { ProposedPlan } from "./types.ts";

export const PLAN_APPROVAL_TTL_MS = 5 * 60 * 1000; // 5min

const VALID_STEP_TYPES = new Set<PlanStepType>([
  "create_file",
  "edit_file",
  "shell_exec",
  "install_dep",
  "observe",
  "custom",
]);

function isPlanStepType(v: unknown): v is PlanStepType {
  return typeof v === "string" && VALID_STEP_TYPES.has(v as PlanStepType);
}

function coerceStep(raw: unknown, idx: number): PlanStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = isPlanStepType(r.type) ? r.type : "custom";
  const description = typeof r.description === "string" && r.description.trim()
    ? r.description.trim()
    : null;
  if (!description) return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : `s${idx + 1}`,
    type,
    description,
    filePath: typeof r.filePath === "string" ? r.filePath : undefined,
    estimatedCost: typeof r.estimatedCost === "number" ? r.estimatedCost : 0.002,
    enabled: r.enabled !== false,
  };
}

/**
 * Tenta extrair um plano estruturado do conteúdo JSON da resposta do LLM.
 * Aceita:
 *   - { plan: [{...}, ...] }     — campo "plan" no root
 *   - { steps: [{...}, ...] }    — campo "steps" no root
 *   - { plan: { steps: [...] } } — objeto aninhado
 * Retorna null se nada parseável.
 */
export function extractPlanFromLlmContent(
  content: string | null | undefined,
): PlanStep[] | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (Array.isArray(obj.plan)) candidates.push(obj.plan);
  else if (obj.plan && typeof obj.plan === "object" && Array.isArray((obj.plan as Record<string, unknown>).steps)) {
    candidates.push((obj.plan as Record<string, unknown>).steps);
  }
  if (Array.isArray(obj.steps)) candidates.push(obj.steps);
  for (const candidate of candidates) {
    const steps: PlanStep[] = [];
    for (let i = 0; i < (candidate as unknown[]).length; i++) {
      const s = coerceStep((candidate as unknown[])[i], i);
      if (s) steps.push(s);
    }
    if (steps.length > 0) return steps;
  }
  return null;
}

/**
 * Extrai {rationale, steps} de um conteúdo JSON do LLM, quando ele segue
 * o schema { plan: { rationale, steps[] } }. Retorna null se não achar.
 */
export function extractRationaleFromLlmContent(
  content: string | null | undefined,
): PlanRationale | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const planObj = obj.plan && typeof obj.plan === "object" && !Array.isArray(obj.plan)
    ? obj.plan as Record<string, unknown>
    : null;
  if (!planObj) return null;
  const rationale = typeof planObj.rationale === "string" && planObj.rationale.trim()
    ? planObj.rationale.trim()
    : "";
  if (Array.isArray(planObj.steps)) {
    const steps: PlanStep[] = [];
    for (let i = 0; i < planObj.steps.length; i++) {
      const s = coerceStep(planObj.steps[i], i);
      if (s) steps.push(s);
    }
    if (steps.length > 0) {
      return { rationale, steps };
    }
  }
  return null;
}

function coercePhases(raw: unknown): ForgePlanPhase[] {
  if (!Array.isArray(raw)) return [];
  const out: ForgePlanPhase[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const title = typeof r.title === "string" && r.title.trim() ? r.title.trim() : `Fase ${i + 1}`;
    const goal = typeof r.goal === "string" ? r.goal.trim() : "";
    const tasks = Array.isArray(r.tasks)
      ? r.tasks.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim())
      : [];
    if (tasks.length === 0 && !goal) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : `phase-${i + 1}`,
      title,
      goal: goal || title,
      tasks: tasks.length ? tasks : [goal || title],
    });
  }
  return out;
}

export function buildPlanDocumentMarkdown(input: {
  summary: string;
  rationale?: string;
  mission?: string;
  objective?: string;
  assumptions?: string[];
  outOfScope?: string[];
  phases?: ForgePlanPhase[];
  steps?: PlanStep[];
}): { markdown: string; mission: string; objective: string; phases: ForgePlanPhase[]; outOfScope: string[] } {
  const mission = input.mission?.trim() || input.summary.trim() || "Entregar o pedido do usuário";
  const objective = input.objective?.trim() || input.rationale?.trim() || "Versão funcional alinhada ao pedido.";
  const approach = input.rationale?.trim() || "Implementação incremental com validação.";
  const assumptions = input.assumptions?.length ? input.assumptions : ["Stack React/Vite do projeto."];
  const outOfScope = input.outOfScope?.length
    ? input.outOfScope
    : ["Não alterar arquivos fora do escopo.", "Não mudar auth/billing sem pedido explícito."];

  let phases = input.phases?.length ? input.phases : [];
  if (phases.length === 0 && input.steps?.length) {
    const mid = Math.ceil(input.steps.length / 2);
    const a = input.steps.slice(0, mid).map((s) => s.description);
    const b = input.steps.slice(mid).map((s) => s.description);
    if (a.length) phases.push({ id: "p1", title: "Fase 1 — Preparação", goal: "Base e contexto.", tasks: a });
    if (b.length) phases.push({ id: "p2", title: "Fase 2 — Implementação", goal: "Mudanças principais.", tasks: b });
  }
  if (phases.length === 0) {
    phases = [{ id: "p1", title: "Fase 1 — Execução", goal: "Implementar e validar.", tasks: ["Analisar", "Implementar", "Validar"] }];
  }

  const lines = [
    "## Missão", mission, "", "## Objetivo", objective, "", "## Abordagem", approach, "",
    "## Premissas", ...assumptions.map((x) => `- ${x}`), "", "## Fases",
  ];
  for (const ph of phases) {
    lines.push(`### ${ph.title}`, ph.goal, "");
    for (const t of ph.tasks) lines.push(`- [ ] ${t}`);
    lines.push("");
  }
  lines.push("## Fora do escopo", ...outOfScope.map((x) => `- ${x}`));
  return { markdown: lines.join("\n").trim(), mission, objective, phases, outOfScope };
}

function attachDocument(plan: ProposedPlan, src: PlanRationale | null, summary: string): ProposedPlan {
  const doc = buildPlanDocumentMarkdown({
    summary,
    rationale: src?.rationale ?? plan.rationale,
    mission: src?.mission,
    objective: src?.objective,
    assumptions: src?.assumptions,
    outOfScope: src?.outOfScope,
    phases: src?.phases,
    steps: plan.steps,
  });
  return {
    ...plan,
    mission: doc.mission,
    objective: doc.objective,
    assumptions: src?.assumptions,
    outOfScope: doc.outOfScope,
    phases: doc.phases,
    markdown: doc.markdown,
  };
}

/**
 * Constrói o ProposedPlan final a partir do que o router devolveu:
 * 1. Se classification.plan (LLM estruturado) tem steps → usa direto, com rationale
 * 2. Senão tenta extrair do rawContent (LLM seguiu parcialmente o schema)
 * 3. Senão usa deriveDefaultPlan (heurística) e rationale genérico
 */
export function buildProposedPlan(
  classification: { type: string; summary: string; plan?: PlanRationale | null },
  rawContent: string | null | undefined,
  options: { planId: string; ttlMs: number; proposedAt?: string },
): ProposedPlan {
  const summary = classification.summary?.trim() || "Plano proposto";

  // Caminho 1: plan estruturado veio do router
  if (classification.plan && classification.plan.steps.length > 0) {
    return attachDocument({
      planId: options.planId,
      summary,
      rationale: classification.plan.rationale || undefined,
      steps: classification.plan.steps,
      ttlMs: options.ttlMs,
      proposedAt: options.proposedAt,
    }, classification.plan, summary);
  }

  // Caminho 2: extrai do rawContent
  const fromRaw = extractRationaleFromLlmContent(rawContent);
  if (fromRaw && fromRaw.steps.length > 0) {
    return attachDocument({
      planId: options.planId,
      summary,
      rationale: fromRaw.rationale || undefined,
      steps: fromRaw.steps,
      ttlMs: options.ttlMs,
      proposedAt: options.proposedAt,
    }, fromRaw, summary);
  }

  // Caminho 3: heurística default
  return attachDocument({
    planId: options.planId,
    summary,
    rationale: "Plano gerado automaticamente — revise as fases antes de aprovar.",
    steps: deriveDefaultPlan(classification.type, summary),
    ttlMs: options.ttlMs,
    proposedAt: options.proposedAt,
  }, null, summary);
}

/**
 * Heurística: deriva um plano default a partir da classificação do router
 * (quando o LLM não produz um plano estruturado). Sempre retorna >=1 passo
 * para que o usuário tenha algo concreto para revisar.
 */
export function deriveDefaultPlan(
  classificationType: string,
  summary: string,
): PlanStep[] {
  const sum = summary?.trim() || "Executar tarefa";
  const baseCost = 0.002;
  if (classificationType === "new_project") {
    return [
      { id: "s1", type: "observe", description: "Ler arquivos existentes do projeto", enabled: true, estimatedCost: baseCost },
      { id: "s2", type: "create_file", description: "Criar arquivos de configuração (package.json, tsconfig)", filePath: "package.json", enabled: true, estimatedCost: baseCost },
      { id: "s3", type: "install_dep", description: "Instalar dependências do projeto", enabled: true, estimatedCost: baseCost },
      { id: "s4", type: "create_file", description: `Implementar: ${sum.slice(0, 80)}`, filePath: "src/App.tsx", enabled: true, estimatedCost: 0.005 },
      { id: "s5", type: "shell_exec", description: "Verificar build e typecheck", enabled: true, estimatedCost: baseCost },
    ];
  }
  if (classificationType === "modify" || classificationType === "fix") {
    return [
      { id: "s1", type: "observe", description: "Ler arquivos relevantes do projeto", enabled: true, estimatedCost: baseCost },
      { id: "s2", type: "edit_file", description: sum.slice(0, 120), enabled: true, estimatedCost: 0.003 },
      { id: "s3", type: "shell_exec", description: "Verificar typecheck e build", enabled: true, estimatedCost: baseCost },
    ];
  }
  if (classificationType === "add_dep") {
    return [
      { id: "s1", type: "install_dep", description: `Instalar: ${sum.slice(0, 80)}`, enabled: true, estimatedCost: 0.002 },
      { id: "s2", type: "edit_file", description: "Integrar dependência no código", enabled: true, estimatedCost: 0.003 },
      { id: "s3", type: "shell_exec", description: "Verificar build", enabled: true, estimatedCost: baseCost },
    ];
  }
  return [
    { id: "s1", type: "observe", description: "Analisar o pedido e o contexto do projeto", enabled: true, estimatedCost: baseCost },
    { id: "s2", type: "custom", description: sum.slice(0, 120), enabled: true, estimatedCost: 0.002 },
  ];
}

/**
 * Resolve o plano final: usa o extraído do LLM se houver, senão aplica o
 * default. Aceita o conteúdo bruto do classificador (string JSON) + o
 * ClassificationResult já parseado.
 */
export function resolvePlan(
  rawContent: string | null | undefined,
  classificationType: string,
  summary: string,
): PlanStep[] {
  const fromLlm = extractPlanFromLlmContent(rawContent);
  if (fromLlm && fromLlm.length > 0) return fromLlm;
  return deriveDefaultPlan(classificationType, summary);
}

/** Valida que os steps aprovados são subset (por id) do plano original. */
export function validateApprovedSteps(
  original: PlanStep[],
  approved: unknown,
): { ok: true; steps: PlanStep[] } | { ok: false; reason: string } {
  if (!Array.isArray(approved)) {
    return { ok: false, reason: "steps inválidos (não é array)" };
  }
  const originalIds = new Set(original.map((s) => s.id));
  const out: PlanStep[] = [];
  for (let i = 0; i < approved.length; i++) {
    const r = approved[i] as Record<string, unknown> | null;
    if (!r || typeof r !== "object") {
      return { ok: false, reason: `step[${i}] inválido` };
    }
    const id = typeof r.id === "string" ? r.id : null;
    if (!id || !originalIds.has(id)) {
      return { ok: false, reason: `step[${i}].id não está no plano original` };
    }
    const original_step = original.find((s) => s.id === id)!;
    if (typeof r.enabled === "boolean" && r.enabled === false) {
      continue; // user desabilitou esse passo
    }
    if (r.enabled === false) continue;
    // Preserva edits do usuário em description/filePath mas mantém o id e o type do original
    out.push({
      id: original_step.id,
      type: original_step.type,
      description: typeof r.description === "string" && r.description.trim()
        ? r.description.trim()
        : original_step.description,
      filePath: typeof r.filePath === "string" ? r.filePath : original_step.filePath,
      estimatedCost: original_step.estimatedCost,
      enabled: true,
    });
  }
  return { ok: true, steps: out };
}
