import type { PlanStep } from "@/lib/agent-progress";

export type ForgePlanPhase = {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
};

export type ForgePlanDocument = {
  mission: string;
  objective: string;
  approach: string;
  assumptions: string[];
  outOfScope: string[];
  phases: ForgePlanPhase[];
  markdown: string;
};

export function buildForgePlanMarkdown(input: {
  summary: string;
  rationale?: string;
  mission?: string;
  objective?: string;
  assumptions?: string[];
  outOfScope?: string[];
  phases?: ForgePlanPhase[];
  steps?: PlanStep[];
}): ForgePlanDocument {
  const mission =
    input.mission?.trim() || input.summary.trim() || "Definir e entregar o pedido do usuário";
  const objective =
    input.objective?.trim() ||
    input.rationale?.trim() ||
    "Entregar uma primeira versão funcional alinhada ao que foi pedido.";
  const approach =
    input.rationale?.trim() || "Abordagem incremental: estrutura, implementação e validação.";
  const assumptions = input.assumptions?.length
    ? input.assumptions
    : ["Projeto React/Vite com preview E2B disponível."];
  const outOfScope = input.outOfScope?.length
    ? input.outOfScope
    : [
        "Não refatorar código fora do escopo do pedido.",
        "Não alterar autenticação ou billing sem pedido explícito.",
      ];

  let phases = input.phases?.length ? input.phases : [];
  if (phases.length === 0 && input.steps?.length) {
    const chunk = Math.max(2, Math.ceil(input.steps.length / 2));
    phases = [
      {
        id: "phase-1",
        title: "Fase 1 — Preparação",
        goal: "Entender o contexto e preparar a base.",
        tasks: input.steps.slice(0, chunk).map((s) => s.description),
      },
      {
        id: "phase-2",
        title: "Fase 2 — Implementação",
        goal: "Executar as mudanças principais.",
        tasks: input.steps.slice(chunk).map((s) => s.description),
      },
    ].filter((p) => p.tasks.length > 0);
  }
  if (phases.length === 0) {
    phases = [
      {
        id: "phase-1",
        title: "Fase 1 — Execução",
        goal: "Implementar o pedido com validação.",
        tasks: ["Analisar o projeto", "Implementar mudanças", "Validar preview e typecheck"],
      },
    ];
  }

  const lines: string[] = [
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
    ...assumptions.map((a) => `- ${a}`),
    "",
    "## Fases",
  ];

  for (const phase of phases) {
    lines.push(`### ${phase.title}`, phase.goal, "");
    for (const task of phase.tasks) {
      lines.push(`- [ ] ${task}`);
    }
    lines.push("");
  }

  lines.push("## Fora do escopo", ...outOfScope.map((o) => `- ${o}`));

  return {
    mission,
    objective,
    approach,
    assumptions,
    outOfScope,
    phases,
    markdown: lines.join("\n").trim(),
  };
}

export function planDocumentFromMeta(
  meta: Record<string, unknown> | null | undefined,
): ForgePlanDocument | null {
  if (!meta) return null;
  if (typeof meta.planMarkdown === "string" && meta.planMarkdown.trim()) {
    const markdown = meta.planMarkdown.trim();
    return {
      mission: typeof meta.planMission === "string" ? meta.planMission : "Plano",
      objective: typeof meta.planObjective === "string" ? meta.planObjective : "",
      approach: typeof meta.planRationale === "string" ? meta.planRationale : "",
      assumptions: Array.isArray(meta.planAssumptions) ? (meta.planAssumptions as string[]) : [],
      outOfScope: Array.isArray(meta.planOutOfScope) ? (meta.planOutOfScope as string[]) : [],
      phases: Array.isArray(meta.planPhases) ? (meta.planPhases as ForgePlanPhase[]) : [],
      markdown,
    };
  }
  return null;
}
