// meta.ts — Tools de decisão do agente (clarify + create_plan).
// Substituem fases orchestrator (needsQualify, proposePlan heurístico).
import type { PlanStep, PlanStepType, ProposedPlan, ToolCall, ToolDefinition, ToolResult, DesignPlanField, DesignReference } from "../types.ts";
import type { ToolRegistry } from "../registry.ts";
import {
  buildPlanDocumentMarkdown,
  filterActionablePlanSteps,
  PLAN_APPROVAL_TTL_MS,
  sanitizePlanHeadline,
} from "../plan-mode.ts";

export const META_CLARIFY_KIND = "meta_clarify";
export const META_PLAN_KIND = "meta_plan";

const VALID_STEP_TYPES = new Set<PlanStepType>([
  "create_file",
  "edit_file",
  "shell_exec",
  "install_dep",
  "observe",
  "custom",
]);

const CHOICE_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "Texto curto da opção (clicável)." },
    description: { type: "string", description: "Detalhe opcional da opção." },
  },
  required: ["label"],
};

export const CLARIFY_TOOL: ToolDefinition = {
  name: "clarify",
  description:
    "Pergunte ao usuário APENAS quando uma ambiguidade for bloqueante para continuar. " +
    "Não use para curiosidade — prefira assumir defaults razoáveis. " +
    "Ofereça 2–4 opções claras quando fizer sentido.",
  parameters: {
    type: "object",
    properties: {
      intro: {
        type: "string",
        description: "1 frase opcional de contexto (sem template 'Entendi:').",
      },
      question: {
        type: "string",
        description: "Pergunta objetiva para o usuário.",
      },
      choices: {
        type: "array",
        items: CHOICE_SCHEMA,
        description: "Opções clicáveis (mínimo 2 quando houver escolha discreta).",
      },
    },
    required: ["question"],
  },
};

export const CREATE_PLAN_TOOL: ToolDefinition = {
  name: "create_plan",
  description:
    "Proponha um plano para revisão do usuário (modo Plan). " +
    "2 a 7 steps = entregas de produto em linguagem humana (seções, fluxos, UX). " +
    "Proibido: paths (src/), npm, tokens CSS, nomes de componentes internos.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Título curto do plano." },
      rationale: {
        type: "string",
        description: "Princípio/regra do plano (1–3 frases, linguagem de negócio).",
      },
      mission: {
        type: "string",
        description: "Parágrafo único para o card de aprovação (como no chat Lovable).",
      },
      objective: { type: "string", description: "Resultado mensurável em linguagem humana." },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "Estado atual / o que está errado (bullets).",
      },
      outOfScope: { type: "array", items: { type: "string" } },
      design: {
        type: "object",
        description:
          "Direção de design (apenas para projetos com UI/web). " +
          "Define a síntese visual antes de construir — voice, momento-memorável, técnicas, referências. " +
          "O usuário aprova a direção junto com o plano.",
        properties: {
          voice: {
            type: "array",
            items: { type: "string" },
            description: "Linguagens visuais escolhidas (ex: ['editorial', 'brutalist']). 2-3 do léxico.",
          },
          moment: {
            type: "string",
            description: "O gesto-memorável concreto e específico do domínio (ex: 'Hero tipográfico gigante com grain + sticky stack de produtos').",
          },
          techniques: {
            type: "array",
            items: { type: "string" },
            description: "Técnicas do catálogo @forge/ui (ex: ['kinetic-typography', 'grain-texture-overlay']).",
          },
          mood: {
            type: "string",
            description: "Mood escolhido do catálogo (ember, ocean, forest, mono, neon, sand, royal, sunset).",
          },
          references: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                screenshot_url: { type: "string" },
              },
            },
            description: "Referências visuais extraídas via web_research/web_scrape/screenshot_capture.",
          },
          anti_patterns: {
            type: "array",
            items: { type: "string" },
            description: "Anti-padrões que você está evitando (ex: 'hero centralizado com 3 cards').",
          },
          synthesis_reasoning: {
            type: "string",
            description: "Por que esta combinação de linguagens serve ao domínio (1-2 frases).",
          },
          relevant_dnas: {
            type: "array",
            items: { type: "string" },
            description: "IDs de DesignDNAs relevantes do catálogo.",
          },
        },
        required: ["voice", "moment", "techniques"],
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: {
              type: "string",
              enum: ["create_file", "edit_file", "shell_exec", "install_dep", "observe", "custom"],
            },
            description: { type: "string" },
            filePath: { type: "string" },
          },
          required: ["description"],
        },
      },
    },
    required: ["summary", "steps"],
  },
};

export const MIN_PLAN_STEPS = 2;
export const MAX_PLAN_STEPS = 7;

export function getMetaToolDefinitions(planMode: boolean): ToolDefinition[] {
  return planMode ? [CLARIFY_TOOL, CREATE_PLAN_TOOL] : [CLARIFY_TOOL];
}

/** Patch/mutação — ocultas em Plan mode (leitura + shell exploratório permanecem). */
export const PLAN_MODE_PATCH_TOOLS = new Set(["fs_write", "fs_edit", "fs_delete"]);

export function isPlanModePatchTool(name: string): boolean {
  return PLAN_MODE_PATCH_TOOLS.has(name);
}

/** Build: registry completo + clarify. Plan: registry − patch + clarify + create_plan. */
export function mergeExecutionToolDefinitions(
  registryDefs: ToolDefinition[],
  planMode = false,
): ToolDefinition[] {
  if (planMode) return mergePlanModeToolDefinitions(registryDefs);
  const filtered = registryDefs.filter((d) => d.name !== "clarify" && d.name !== "create_plan");
  return [...filtered, ...getMetaToolDefinitions(false)];
}

/** Plan mode — tudo exceto fs_write/fs_edit/fs_delete; shell_exec para grep/cat/ls. */
export function mergePlanModeToolDefinitions(registryDefs: ToolDefinition[]): ToolDefinition[] {
  const filtered = registryDefs.filter(
    (d) =>
      !PLAN_MODE_PATCH_TOOLS.has(d.name) && d.name !== "clarify" && d.name !== "create_plan",
  );
  return [...filtered, ...getMetaToolDefinitions(true)];
}

export function splitMetaToolCalls(toolCalls: ToolCall[]): {
  clarify: ToolCall | null;
  createPlan: ToolCall | null;
  execution: ToolCall[];
} {
  let clarify: ToolCall | null = null;
  let createPlan: ToolCall | null = null;
  const execution: ToolCall[] = [];
  for (const call of toolCalls) {
    if (call.name === "clarify") clarify = call;
    else if (call.name === "create_plan") createPlan = call;
    else execution.push(call);
  }
  return { clarify, createPlan, execution };
}

export function hasMixedMetaAndExecution(toolCalls: ToolCall[] | undefined): boolean {
  if (!toolCalls?.length) return false;
  const { clarify, createPlan, execution } = splitMetaToolCalls(toolCalls);
  return execution.length > 0 && (clarify !== null || createPlan !== null);
}

export function registerMetaTools(reg: ToolRegistry, opts: { planMode: boolean }): void {
  reg.register(CLARIFY_TOOL, async (args) => metaClarifyHandler(args));
  if (opts.planMode) {
    reg.register(CREATE_PLAN_TOOL, async (args) => metaPlanHandler(args));
  }
}

async function metaClarifyHandler(args: Record<string, unknown>): Promise<ToolResult> {
  return {
    toolCallId: "",
    ok: true,
    output: { kind: META_CLARIFY_KIND, ...args },
  };
}

async function metaPlanHandler(args: Record<string, unknown>): Promise<ToolResult> {
  return {
    toolCallId: "",
    ok: true,
    output: { kind: META_PLAN_KIND, ...args },
  };
}

/** Formata args da tool clarify em markdown para o chat. */
export function formatClarifyMessage(args: Record<string, unknown>): string {
  const parts: string[] = [];
  const intro = typeof args.intro === "string" ? args.intro.trim() : "";
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (intro) parts.push(intro);
  if (question) parts.push(question);
  const choices = Array.isArray(args.choices) ? args.choices : [];
  for (const raw of choices) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const label = typeof c.label === "string" ? c.label.trim() : "";
    if (!label) continue;
    const desc = typeof c.description === "string" ? c.description.trim() : "";
    parts.push(desc ? `- **${label}** — ${desc}` : `- **${label}**`);
  }
  return parts.join("\n\n").trim() || question || intro || "";
}

function coercePlanSteps(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const description =
      typeof o.description === "string" && o.description.trim() ? o.description.trim() : null;
    if (!description) continue;
    const typeRaw = typeof o.type === "string" ? o.type : "custom";
    const type = VALID_STEP_TYPES.has(typeRaw as PlanStepType)
      ? (typeRaw as PlanStepType)
      : "custom";
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : `s${i + 1}`,
      type,
      description,
      filePath: typeof o.filePath === "string" ? o.filePath : undefined,
      estimatedCost: 0.002,
      enabled: true,
    });
  }
  return out;
}

/** Converte args de create_plan em ProposedPlan persistível. */
export function proposedPlanFromToolArgs(
  args: Record<string, unknown>,
  planId = crypto.randomUUID(),
): ProposedPlan | null {
  const summaryRaw = typeof args.summary === "string" ? args.summary.trim() : "";
  const steps = filterActionablePlanSteps(coercePlanSteps(args.steps));
  if (!summaryRaw || steps.length < MIN_PLAN_STEPS || steps.length > MAX_PLAN_STEPS) {
    return null;
  }

  const rationale = typeof args.rationale === "string" ? args.rationale.trim() : undefined;
  const missionRaw = typeof args.mission === "string" ? args.mission.trim() : undefined;
  const objectiveRaw = typeof args.objective === "string" ? args.objective.trim() : undefined;
  const assumptions = Array.isArray(args.assumptions)
    ? (args.assumptions as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;
  const outOfScope = Array.isArray(args.outOfScope)
    ? (args.outOfScope as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;

  // Extrai campo design (opcional — só para projetos com UI)
  let design: DesignPlanField | undefined;
  if (args.design && typeof args.design === "object") {
    const d = args.design as Record<string, unknown>;
    const voice = Array.isArray(d.voice)
      ? (d.voice as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const moment = typeof d.moment === "string" ? d.moment.trim() : "";
    const techniques = Array.isArray(d.techniques)
      ? (d.techniques as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (voice.length > 0 && moment) {
      const references: DesignReference[] = Array.isArray(d.references)
        ? (d.references as unknown[])
            .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
            .map((r) => ({
              url: typeof r.url === "string" ? r.url : "",
              title: typeof r.title === "string" ? r.title : undefined,
              screenshot_url: typeof r.screenshot_url === "string" ? r.screenshot_url : undefined,
            }))
            .filter((r) => r.url)
        : [];
      design = {
        voice,
        moment,
        techniques,
        mood: typeof d.mood === "string" ? d.mood : undefined,
        references: references.length > 0 ? references : undefined,
        anti_patterns: Array.isArray(d.anti_patterns)
          ? (d.anti_patterns as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
        synthesis_reasoning: typeof d.synthesis_reasoning === "string" ? d.synthesis_reasoning : undefined,
        relevant_dnas: Array.isArray(d.relevant_dnas)
          ? (d.relevant_dnas as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
      };
    }
  }

  const headline = sanitizePlanHeadline(missionRaw ?? summaryRaw, "Plano proposto");
  const doc = buildPlanDocumentMarkdown({
    summary: headline,
    rationale,
    mission: missionRaw,
    objective: objectiveRaw,
    assumptions,
    outOfScope,
    steps,
  });

  return {
    planId,
    summary: headline,
    rationale,
    mission: doc.mission,
    objective: doc.objective,
    assumptions,
    outOfScope: doc.outOfScope,
    phases: doc.phases,
    markdown: doc.markdown,
    steps,
    design,
    ttlMs: PLAN_APPROVAL_TTL_MS,
    proposedAt: new Date().toISOString(),
  };
}

export {
  VIBE_CLARIFY_HINT as BUILD_CLARIFY_RULE,
  VIBE_PLAN_RULES as PLAN_MODE_AGENT_RULES,
} from "../vibe-coding-prompt.ts";