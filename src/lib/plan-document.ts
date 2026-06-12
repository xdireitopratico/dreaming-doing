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
  const title = input.summary?.trim() || input.mission?.trim() || "Plano proposto";
  const mission =
    input.mission?.trim() || input.summary.trim() || "Definir e entregar o pedido do usuário";
  const objective =
    input.objective?.trim() ||
    input.rationale?.trim() ||
    "Entregar uma primeira versão funcional alinhada ao que foi pedido.";
  const principle =
    input.rationale?.trim() ||
    input.objective?.trim() ||
    "Abordagem incremental alinhada ao pedido do usuário.";
  const assumptions = input.assumptions?.length
    ? input.assumptions
    : ["Contexto atual será refinado durante a execução."];
  const outOfScope = input.outOfScope?.length
    ? input.outOfScope
    : [
        "Não refatorar código fora do escopo do pedido.",
        "Não alterar autenticação ou billing sem pedido explícito.",
      ];

  const enabledSteps = (input.steps ?? []).filter((s) => s.enabled !== false);
  const deliverables =
    enabledSteps.length > 0
      ? enabledSteps.map((s) => s.description)
      : ["Implementar o pedido com validação no preview."];

  let phases = input.phases?.length ? input.phases : [];
  if (phases.length === 0 && enabledSteps.length > 0) {
    phases = [
      {
        id: "phase-1",
        title: "Entregas",
        goal: "Passos aprovados para execução.",
        tasks: deliverables,
      },
    ];
  }

  const lines: string[] = [
    `# ${title}`,
    "",
    "## Princípio (sua regra)",
    principle,
    "",
    "## Estado atual (o que está errado)",
    ...assumptions.map((a) => `- ${a}`),
    "",
    "## Entregas",
    ...deliverables.map((d) => `- ${d}`),
  ];

  if (outOfScope.length > 0) {
    lines.push("", "## Fora do escopo", ...outOfScope.map((o) => `- ${o}`));
  }

  return {
    mission,
    objective,
    approach: principle,
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