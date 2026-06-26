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
    "Ofereça 2–4 opções claras quando fizer sentido. " +
    "Para múltiplas perguntas, use `questions` (array) em vez de `question` (string única).",
  parameters: {
    type: "object",
    properties: {
      intro: {
        type: "string",
        description: "1 frase opcional de contexto (sem template 'Entendi:').",
      },
      question: {
        type: "string",
        description: "Pergunta objetiva para o usuário (modo single-question).",
      },
      choices: {
        type: "array",
        items: CHOICE_SCHEMA,
        description: "Opções clicáveis (mínimo 2 quando houver escolha discreta).",
      },
      multiple: {
        type: "boolean",
        description:
          "Modo single-question: permite selecionar várias opções ao mesmo tempo.",
      },
      questions: {
        type: "array",
        description:
          "Múltiplas perguntas para fechar escopo. Use quando precisar de 2+ perguntas " +
          "antes de prosseguir. O usuário responderá todas em wizard com revisão final.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "ID único da pergunta (ex: 'q1', 'q2').",
            },
            intro: {
              type: "string",
              description: "Contexto opcional da pergunta.",
            },
            question: {
              type: "string",
              description: "Pergunta objetiva.",
            },
            multiple: {
              type: "boolean",
              description: "Permite selecionar várias opções ao mesmo tempo.",
            },
            choices: {
              type: "array",
              items: CHOICE_SCHEMA,
              description: "Opções clicáveis (mínimo 2 quando houver escolha discreta).",
            },
          },
          required: ["id", "question"],
        },
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
    "Proibido: paths (src/), npm, tokens CSS, nomes de componentes internos. " +
    "O documento final é o campo `markdown` — escreva você mesmo, em texto fino e adaptado ao contexto. " +
    "Nunca invente seção vazia; o documento escala com a complexidade.",
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Título curto do plano." },
      mission: {
        type: "string",
        description: "Parágrafo único para o card de aprovação (como no chat Lovable).",
      },
      markdown: {
        type: "string",
        description:
          "Documento markdown fino do plano — é o que o usuário lê no inspector. " +
          "Escreva você mesmo, adaptado ao contexto deste pedido específico. " +
          "ESTRUTURA RECOMENDADA (use só as seções que agregarem valor; nunca invente seção vazia):\n" +
          "1. Conexão — ancora no pedido literal do usuário.\n" +
          "2. O que encontrei — bugs, estado atual, evidência. Constroi confiança.\n" +
          "3. Entregáveis — o que existirá depois, contável e concreto.\n" +
          "4. Fases & Etapas — sequência com contagem upfront (ex: '3 fases, 12 etapas').\n" +
          "5. Expectativa — estado 'depois'. Fecha o loop com a conexão.\n" +
          "6. Como validar — prova concreta que o usuário consegue executar.\n" +
          "7. Riscos — o que pode dar errado, com severidade.\n" +
          "8. Premissas — no que o plano está apostando.\n" +
          "9. Fora do escopo — explicitamente NÃO será feito.\n" +
          "10. Perguntas — só se houver ambiguidade genuína bloqueante.\n" +
          "11. Considerações — alternativas descartadas + por quê; observações, sugestões.\n" +
          "Use blockquote (>) para material subjetivo após o plano fechado. " +
          "Plano simples = documento curto. Migração complexa = documento completo.",
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
      design: {
        type: "object",
        description: "Direção de design (projetos com UI) — voice, moment, techniques, compositions, read_paths.",
        properties: {
          voice: { type: "array", items: { type: "string" } },
          moment: { type: "string" },
          techniques: { type: "array", items: { type: "string" } },
          mood: { type: "string" },
          compositions: { type: "array", items: { type: "string" } },
          composition_exports: { type: "array", items: { type: "string" } },
          relevant_dnas: { type: "array", items: { type: "string" } },
          read_paths: { type: "array", items: { type: "string" } },
          anti_patterns: { type: "array", items: { type: "string" } },
          synthesis_reasoning: { type: "string" },
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
          },
        },
      },
    },
    required: ["summary", "steps", "markdown"],
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
  const questions = extractClarifyQuestions(args);
  if (questions.length > 1) {
    // Multi-question: render each question with its choices as sections
    const blocks: string[] = [];
    const intro = typeof args.intro === "string" ? args.intro.trim() : "";
    if (intro) blocks.push(intro);
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const lines: string[] = [];
      if (q.intro) lines.push(q.intro);
      lines.push(`**Q${i + 1}: ${q.question}**`);
      for (const c of q.choices) {
        lines.push(c.description ? `- **${c.label}** — ${c.description}` : `- **${c.label}**`);
      }
      blocks.push(lines.join("\n"));
    }
    return blocks.join("\n\n").trim();
  }

  // Single-question mode (legacy)
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

/** Extrai questions estruturadas dos args da tool clarify. */
export type ClarifyQuestionOut = {
  id: string;
  intro?: string;
  question: string;
  multiple?: boolean;
  choices: Array<{ id: string; label: string; description?: string }>;
};

export function extractClarifyQuestions(args: Record<string, unknown>): ClarifyQuestionOut[] {
  // Multi-question mode
  if (Array.isArray(args.questions) && args.questions.length > 0) {
    const out: ClarifyQuestionOut[] = [];
    for (let i = 0; i < args.questions.length; i++) {
      const raw = args.questions[i];
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const question = typeof o.question === "string" ? o.question.trim() : "";
      if (!question) continue;
      const id = typeof o.id === "string" && o.id ? o.id : `q${i + 1}`;
      const intro = typeof o.intro === "string" && o.intro.trim() ? o.intro.trim() : undefined;
      const multiple = o.multiple === true;
      const choices = parseChoiceArray(o.choices);
      out.push({ id, intro, question, multiple, choices });
    }
    if (out.length > 0) return out;
  }

  // Single-question fallback
  const question = typeof args.question === "string" ? args.question.trim() : "";
  if (!question) return [];
  const intro = typeof args.intro === "string" && args.intro.trim() ? args.intro.trim() : undefined;
  const multiple = args.multiple === true;
  const choices = parseChoiceArray(args.choices);
  return [{ id: "q1", intro, question, multiple, choices }];
}

function parseChoiceArray(raw: unknown): Array<{ id: string; label: string; description?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; label: string; description?: string }> = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== "object") continue;
    const c = r as Record<string, unknown>;
    const label = typeof c.label === "string" ? c.label.trim() : "";
    if (!label) continue;
    const desc = typeof c.description === "string" && c.description.trim() ? c.description.trim() : undefined;
    out.push({ id: `c${i}`, label, description: desc });
  }
  return out;
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
      const compositions = Array.isArray(d.compositions)
        ? (d.compositions as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined;
      const composition_exports = Array.isArray(d.composition_exports)
        ? (d.composition_exports as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined;
      const read_paths = Array.isArray(d.read_paths)
        ? (d.read_paths as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined;
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
        compositions: compositions?.length ? compositions : undefined,
        composition_exports: composition_exports?.length ? composition_exports : undefined,
        read_paths: read_paths?.length ? read_paths : undefined,
      };
    }
  }

  const headline = sanitizePlanHeadline(missionRaw ?? summaryRaw, "Plano proposto");

  // Prioridade 1: markdown fino escrito pelo LLM (paradigma novo).
  const llmMarkdown =
    typeof args.markdown === "string" && args.markdown.trim() ? args.markdown.trim() : undefined;

  // Fallback: documento gerado a partir dos campos estruturados (legado, transição).
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
    markdown: llmMarkdown ?? doc.markdown,
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