// plan-mode.ts — Plan mode: helpers de documento, sanitização e plano persistido no chat.
// A proposta de plano vem da tool create_plan (meta.ts) — sem duplicar aqui.
import type { ChatMessage, ForgePlanPhase, LLMProvider, PlanStep, PlanStepType, ProposedPlan } from "./types.ts";
import { llmChatLine } from "./narration.ts";

export type { ForgePlanPhase, PlanStep, PlanStepType, ProposedPlan } from "./types.ts";

/** Legado do router — campo opcional em ClassificationResult. */
export interface PlanRationale {
  rationale: string;
  steps: PlanStep[];
  mission?: string;
  objective?: string;
  assumptions?: string[];
  outOfScope?: string[];
  phases?: ForgePlanPhase[];
}

/** Plano enviado não expira — usuário aprova quando quiser. */
export const PLAN_APPROVAL_TTL_MS = Number.MAX_SAFE_INTEGER;

const META_HEADLINE_RE =
  /^(conversa:|preciso ver|primeira intera|não há plano|nao ha plano|usuário pede|usuario pede|o usuário|a usuária)/i;

/** Bloqueia meta-comentários do classify de vazarem para o chat. */
export function sanitizePlanHeadline(
  headline: string | undefined | null,
  fallback: string,
): string {
  const h = headline?.trim() ?? "";
  if (!h || META_HEADLINE_RE.test(h)) return fallback;
  if (/^conversa:/i.test(h)) return fallback;
  return h;
}

const META_STEP_RE =
  /pedir (ao|à) usu[aá]rio|perguntar (ao|à) usu[aá]rio|colar o plano|compartilhe o plano|me diga onde est[aá]|pe[cç]a ao usu[aá]rio/i;

/** Passo executável no build — não meta-conversação. */
export function isActionablePlanStep(description: string): boolean {
  const d = description.trim();
  if (!d) return false;
  return !META_STEP_RE.test(d);
}

export function filterActionablePlanSteps(steps: PlanStep[]): PlanStep[] {
  const actionable = steps.filter((s) => isActionablePlanStep(s.description));
  return actionable.length > 0 ? actionable : steps;
}

/** Usuário pede para ver/reabrir plano existente (estilo Lovable). */
export function isShowExistingPlanRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /mostr(a|e|ar)\s+(o\s+)?plano/.test(t) ||
    /ver\s+(o\s+)?plano/.test(t) ||
    /abre?\s+(o\s+)?plano/.test(t) ||
    /reabr(e|ir)\s+(o\s+)?plano/.test(t) ||
    /plano\s+(pronto|existente|anterior|a[ií])/.test(t) ||
    /tem\s+um\s+plano/.test(t) ||
    /c[eê]\s+tem\s+um\s+plano/.test(t) ||
    /qual\s+(é|e)\s+o\s+plano/.test(t)
  );
}

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
  const description =
    typeof r.description === "string" && r.description.trim() ? r.description.trim() : null;
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

function asPlanStepsFromMeta(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = coerceStep(raw[i], i);
    if (s) out.push(s);
  }
  return out;
}

/** Plano persistido no meta de mensagem assistant (espelha plan-message-meta.ts no client). */
export function extractStoredPlanFromMessageMeta(
  meta: Record<string, unknown> | undefined,
): ProposedPlan | null {
  if (!meta) return null;
  const planId = typeof meta.planId === "string" ? meta.planId : null;
  const steps = asPlanStepsFromMeta(meta.planSteps);
  if (!planId || steps.length === 0) return null;
  const rawSummary = typeof meta.planSummary === "string" ? meta.planSummary : "Plano proposto";
  const mission = typeof meta.planMission === "string" ? meta.planMission : undefined;
  return {
    planId,
    summary: sanitizePlanHeadline(mission ?? rawSummary, "Plano proposto"),
    rationale:
      typeof meta.planRationale === "string" && meta.planRationale.trim()
        ? meta.planRationale.trim()
        : undefined,
    mission,
    objective: typeof meta.planObjective === "string" ? meta.planObjective : undefined,
    markdown:
      typeof meta.planMarkdown === "string" && meta.planMarkdown.trim()
        ? meta.planMarkdown.trim()
        : undefined,
    assumptions: Array.isArray(meta.planAssumptions)
      ? (meta.planAssumptions as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    outOfScope: Array.isArray(meta.planOutOfScope)
      ? (meta.planOutOfScope as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
    phases: Array.isArray(meta.planPhases) ? (meta.planPhases as ForgePlanPhase[]) : undefined,
    steps,
    ttlMs: PLAN_APPROVAL_TTL_MS,
    proposedAt: new Date().toISOString(),
  };
}

export type StoredPlanEntry = { plan: ProposedPlan; status: "pending" | "approved" | "rejected" };

/** Último plano no histórico — prioriza pendente, depois qualquer com steps. */
export function findLatestStoredPlan(messages: ChatMessage[]): StoredPlanEntry | null {
  let fallback: StoredPlanEntry | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    const plan = extractStoredPlanFromMessageMeta(msg.meta);
    if (!plan) continue;
    const statusRaw = msg.meta?.planStatus;
    const status: StoredPlanEntry["status"] =
      statusRaw === "approved" || statusRaw === "rejected" || statusRaw === "pending"
        ? statusRaw
        : "pending";
    const entry = { plan, status };
    if (status === "pending") return entry;
    if (!fallback) fallback = entry;
  }
  return fallback;
}

const PLAN_CHAT_SYSTEM = `Você apresenta um plano no FORGE — tom humano, português, 2–4 frases.
Mencione a missão do plano e oriente o usuário a revisar no painel ao lado e aprovar quando estiver pronto.
Pode usar markdown leve (negrito no título). Sem listas longas — o detalhe está no inspector.`;

/** Mensagem do chat em Plan mode — só LLM, sem template fixo. */
export async function generatePlanChatMessage(
  model: LLMProvider,
  plan: ProposedPlan,
): Promise<string | null> {
  const mission = sanitizePlanHeadline(plan.mission ?? plan.summary, "Plano para seu pedido");
  const objective = plan.objective?.trim() || "";
  const stepCount = plan.steps?.length ?? 0;
  return llmChatLine(
    model,
    PLAN_CHAT_SYSTEM,
    [
      `Missão: ${mission}`,
      objective ? `Objetivo: ${objective}` : "",
      `Passos no plano: ${stepCount}`,
      plan.summary?.trim() ? `Resumo: ${plan.summary.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { max_tokens: 400, minLength: 24, temperature: 0.45 },
  );
}

/** Resumo markdown do último plano para contexto do agente. */
export function lastPlanContextFromMessages(messages: ChatMessage[]): string {
  const stored = findLatestStoredPlan(messages);
  if (!stored) return "nenhum";
  const p = stored.plan;
  if (p.markdown?.trim()) return p.markdown.trim().slice(0, 2000);
  const parts = [
    p.mission && `Missão: ${p.mission}`,
    p.objective && `Objetivo: ${p.objective}`,
    p.summary && `Resumo: ${p.summary}`,
    `Status: ${stored.status}`,
  ].filter(Boolean);
  return parts.join("\n").slice(0, 2000) || "nenhum";
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
}): {
  markdown: string;
  mission: string;
  objective: string;
  phases: ForgePlanPhase[];
  outOfScope: string[];
} {
  const mission = input.mission?.trim() || input.summary.trim() || "Entregar o pedido do usuário";
  const objective =
    input.objective?.trim() || input.rationale?.trim() || "Versão funcional alinhada ao pedido.";
  const approach = input.rationale?.trim() || "Implementação incremental com validação.";
  const assumptions = input.assumptions?.length
    ? input.assumptions
    : ["Stack React/Vite do projeto."];
  const outOfScope = input.outOfScope?.length
    ? input.outOfScope
    : ["Não alterar arquivos fora do escopo.", "Não mudar auth/billing sem pedido explícito."];

  let phases = input.phases?.length ? input.phases : [];
  if (phases.length === 0 && input.steps?.length) {
    const mid = Math.ceil(input.steps.length / 2);
    const a = input.steps.slice(0, mid).map((s) => s.description);
    const b = input.steps.slice(mid).map((s) => s.description);
    if (a.length)
      phases.push({ id: "p1", title: "Fase 1 — Preparação", goal: "Base e contexto.", tasks: a });
    if (b.length)
      phases.push({
        id: "p2",
        title: "Fase 2 — Implementação",
        goal: "Mudanças principais.",
        tasks: b,
      });
  }
  if (phases.length === 0) {
    phases = [
      {
        id: "p1",
        title: "Fase 1 — Execução",
        goal: "Implementar e validar.",
        tasks: ["Analisar", "Implementar", "Validar"],
      },
    ];
  }

  const lines = [
    "## Missão",
    mission,
    "",
    "## Objetivo",
    objective,
    "",
    "## Abordagem",
    approach,
    "",
    "## Premissas",
    ...assumptions.map((x) => `- ${x}`),
    "",
    "## Fases",
  ];
  for (const ph of phases) {
    lines.push(`### ${ph.title}`, ph.goal, "");
    for (const t of ph.tasks) lines.push(`- [ ] ${t}`);
    lines.push("");
  }
  lines.push("## Fora do escopo", ...outOfScope.map((x) => `- ${x}`));
  return { markdown: lines.join("\n").trim(), mission, objective, phases, outOfScope };
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
      continue;
    }
    if (r.enabled === false) continue;
    out.push({
      id: original_step.id,
      type: original_step.type,
      description:
        typeof r.description === "string" && r.description.trim()
          ? r.description.trim()
          : original_step.description,
      filePath: typeof r.filePath === "string" ? r.filePath : original_step.filePath,
      estimatedCost: original_step.estimatedCost,
      enabled: true,
    });
  }
  return { ok: true, steps: out };
}