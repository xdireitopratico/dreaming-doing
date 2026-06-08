import type { AgentProgress, PlanStep } from "@/lib/agent-progress";

export type WorkingStepState = "pending" | "active" | "done";

export type WorkingStep = {
  id: string;
  label: string;
  state: WorkingStepState;
};

const BUILD_PIPELINE: { id: string; label: string; phases: string[] }[] = [
  { id: "understand", label: "Entender o pedido", phases: ["gather", "classify", "taste", "taste_chat"] },
  { id: "prepare", label: "Preparar ambiente", phases: ["plan", "skills", "memory"] },
  { id: "implement", label: "Implementar mudanças", phases: ["execute"] },
  { id: "verify", label: "Verificar build", phases: ["observe"] },
  { id: "deliver", label: "Entregar resposta", phases: ["summarize", "done"] },
];

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

export function lastEditedPath(progress: AgentProgress): string | null {
  for (let i = progress.tools.length - 1; i >= 0; i--) {
    const t = progress.tools[i]!;
    if ((t.name === "fs_write" || t.name === "fs_edit") && t.args?.path) {
      return String(t.args.path);
    }
  }
  for (let i = progress.diffs.length - 1; i >= 0; i--) {
    const d = progress.diffs[i]!;
    if (d.path) return d.path;
  }
  return progress.deliveryFiles?.at(-1) ?? null;
}

export function buildWorkingTitle(progress: AgentProgress, running: boolean): string {
  if (!running && progress.finished) {
    if (progress.canceled) return "Execução cancelada";
    if (progress.error && !progress.lastFinishOk) return "Execução interrompida";
    return "Entrega concluída";
  }

  const edited = lastEditedPath(progress);
  if (edited) return `Trabalhando em ${fileBase(edited)}`;

  const activeTool = progress.tools.filter((t) => t.ok === undefined).at(-1);
  if (activeTool?.name === "fs_read" || activeTool?.name === "fs_read_many") {
    const path = activeTool.args?.path ?? activeTool.args?.pattern;
    return path ? `Lendo ${fileBase(String(path))}` : "Lendo arquivos do projeto";
  }
  if (activeTool?.name === "fs_list" || activeTool?.name === "fs_glob" || activeTool?.name === "fs_search") {
    return "Explorando o projeto";
  }
  if (activeTool?.name === "shell_exec") return "Executando no sandbox";

  if (progress.phase === "classify" || progress.phase === "gather") {
    return "Entendendo o que você pediu";
  }
  if (progress.phase === "execute") {
    const step = progress.currentStep;
    const total = progress.totalSteps;
    if (step != null && total != null && total > 0) {
      return `Implementando (passo ${step}/${total})`;
    }
    return "Implementando mudanças";
  }
  if (progress.phase === "observe") return "Verificando se compila";
  if (progress.phase === "summarize") return "Finalizando entrega";
  if (progress.autoResuming) return "Retomando automaticamente no servidor";

  return progress.message?.trim() || progress.statusHint?.trim() || "Trabalhando no seu pedido";
}

function pipelineIndexForPhase(phase: string | null): number {
  if (!phase) return -1;
  return BUILD_PIPELINE.findIndex((s) => s.phases.includes(phase));
}

function buildPlanSteps(steps: PlanStep[], progress: AgentProgress, running: boolean): WorkingStep[] {
  const current = progress.currentStep ?? 0;
  return steps.filter((s) => s.enabled).map((s, idx) => {
    const n = idx + 1;
    let state: WorkingStepState = "pending";
    if (!running && progress.finished) {
      state = progress.lastFinishOk ? "done" : idx < current ? "done" : "pending";
    } else if (n < current) state = "done";
    else if (n === current) state = "active";
    return { id: s.id, label: s.description || s.id, state };
  });
}

export function buildWorkingSteps(
  progress: AgentProgress,
  opts?: { running?: boolean; planSteps?: PlanStep[] },
): WorkingStep[] {
  const running = opts?.running ?? !progress.finished;
  if (opts?.planSteps?.length) {
    return buildPlanSteps(opts.planSteps, progress, running);
  }

  const phaseIdx = pipelineIndexForPhase(progress.phase);
  const hasTools = progress.tools.some((t) => t.ok === true);
  const hasDelivery = (progress.deliveryFiles?.length ?? 0) > 0;

  return BUILD_PIPELINE.map((step, idx) => {
    let state: WorkingStepState = "pending";

    if (!running && progress.finished) {
      state = progress.lastFinishOk || progress.canceled ? "done" : idx <= phaseIdx ? "done" : "pending";
    } else if (phaseIdx < 0) {
      state = idx === 0 ? "active" : "pending";
    } else if (idx < phaseIdx) {
      state = "done";
    } else if (idx === phaseIdx) {
      state = "active";
    } else if (step.id === "implement" && (hasTools || hasDelivery)) {
      state = phaseIdx < idx ? "active" : state;
    }

    if (!running && progress.finished && progress.lastFinishOk) {
      state = "done";
    }

    return { id: step.id, label: step.label, state };
  });
}

export function buildStatusChips(progress: AgentProgress, running: boolean): string[] {
  if (!running) return [];
  const chips: string[] = [];
  const activeTool = progress.tools.filter((t) => t.ok === undefined).at(-1);
  if (activeTool) {
    const path = activeTool.args?.path;
    if (path) chips.push(`${activeTool.name} · ${fileBase(String(path))}`);
    else chips.push(activeTool.name);
  }
  if (progress.autoResuming) chips.push("Retomando no servidor");
  if (chips.length < 2 && progress.phase === "classify") {
    chips.push("Analisando escopo");
  }
  return chips.slice(0, 2);
}