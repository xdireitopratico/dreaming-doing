import type { AgentProgress, PendingPlan, PlanStep, SSEEvent } from "@/lib/agent-progress";
import { resolveTerminalPhase } from "@/lib/agent-progress";
import { lifecycleLabel, resolveAgentLifecycle } from "@/lib/agent-lifecycle";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";
import { sanitizeRunText } from "@/lib/run-story-hygiene";
import {
  buildForgeTimeline,
  hasActiveJob as hasActiveJobInner,
  timelineItemBriefing,
  type ForgeTimelineItem,
  type TimelineItemType,
} from "@/lib/timeline-builder";
import { projectActionLedgerLine } from "@/lib/chat/action-ledger";


export type MiniCardStatus = "thinking" | "working" | "done" | "failed";

export type ForgeActivityStatus = "done" | "active" | "failed";

export type ForgeActivityLine = {
  id: string;
  /** Título curto: "Editando App.tsx", "Executando npm build". */
  label: string;
  /** Subtítulo descritivo: path completo, detalhe do tool, output resumido. */
  description?: string;
  /** Nome do tool original: "fs_edit", "shell_exec" → ícone semântico. */
  toolName?: string;
  status: ForgeActivityStatus;
};

export type ForgeMiniCardData = {
  /** Título da sessão quando terminal (ex.: «Brainstorm de app mobile»). */
  title: string;
  /** Header Lovable: «Edited App.tsx», «Running command», «Working». */
  header: string;
  /** Subtitle rotativo — briefing da tarefa ativa. */
  subtitle: string;
  /** Briefings rotativos enquanto o job está ativo — resumo miniatura da timeline. */
  liveBriefings: string[];
  status: MiniCardStatus;
  /** Activity stream — últimos 3-4 itens da timeline com status visual.
   *  Substitui briefing único por janela de atividade real happening. */
  activity: ForgeActivityLine[];
  /** Task list visível apenas em build materializado ou quando o LLM declarou tasks. */
  tasks?: Array<{
    id: string;
    label: string;
    criteria?: string;
    status: 'pending' | 'active' | 'done' | 'failed';
  }>;
  /** Linha viva única — estado atual do job (rotativo). */
  liveLine?: string;
  editedFile?: string | null;
  fileCount?: number;
  hasPlan?: boolean;
  /** Plano completo quando o run tem plano associado (driven plan).
   *  Permite que o mini card renderize fases/steps com o mesmo componente do ChatPlanDock. */
  pendingPlan?: PendingPlan | null;
  /** Fase 2.2 — action chips: o último tool executado vira chip clicável
   *  no mini card (Show file / Show diff / Show output / Show preview). */
  lastTool?: {
    name: string;
    path?: string;
    ok?: boolean;
  } | null;
};

export type AgentRunView = {
  runId: string;
  miniCard: ForgeMiniCardData;
  narration: string | null;
  closingText: string | null;
  timeline: ForgeTimelineItem[];
  error: string | null;
  finished: boolean;
  lastFinishOk: boolean | null;
  resumable: boolean;
  conversational?: boolean;
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function pathFromArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  return String(args.path ?? args.filePath ?? args.file ?? "");
}

function truncate(text: string, max = 72): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function derivePlanTasks(
  jobPlan: PendingPlan | null | undefined,
  progress: AgentProgress,
  jobActive: boolean,
): NonNullable<ForgeMiniCardData["tasks"]> {
  const declaredTasks = progress.tasks ?? [];
  const canUsePlanSteps =
    !!jobPlan?.steps?.length &&
    (progress.mode === "build" || progress.phase === "build" || progress.phase === "execute" || jobActive);
  if (!canUsePlanSteps) return declaredTasks;

  const currentStep = typeof progress.currentStep === "number" ? progress.currentStep : null;
  const totalSteps = jobPlan.steps.length;
  const finishedOk = progress.finished && progress.lastFinishOk !== false;
  const failed = progress.finished && progress.lastFinishOk === false;

  return jobPlan.steps.map((step, idx) => {
    const stepNumber = idx + 1;
    let status: "pending" | "active" | "done" | "failed" = "pending";
    if (finishedOk) {
      status = "done";
    } else if (failed) {
      if (currentStep != null && stepNumber < currentStep) status = "done";
      else if (currentStep != null && stepNumber === currentStep) status = "failed";
    } else if (currentStep != null) {
      if (stepNumber < currentStep) status = "done";
      else if (stepNumber === currentStep) status = "active";
    } else if (jobActive && idx === 0) {
      status = "active";
    }

    const rawLabel =
      step.description?.trim() ||
      step.filePath?.trim() ||
      `Etapa ${stepNumber}/${totalSteps}`;
    const rawCriteria =
      step.filePath?.trim() ||
      (step.enabled === false ? "Desativada" : undefined);

    return {
      id: step.id || `plan-step-${idx}`,
      label: truncate(rawLabel, 96),
      criteria: rawCriteria ? truncate(rawCriteria, 120) : undefined,
      status,
    };
  });
}

/** Só raciocínio interno vai ao inspector — delta/final sem thinking ficam no chat. */
function isInspectorThought(data: Record<string, unknown>): boolean {
  return data.thinking === true;
}

function normalizeProse(prose: string): string {
  const lines = prose.split("\n");
  if (lines.length <= 1) return prose.trim();
  const allShort = lines.every((l) => l.trim().length <= 24);
  if (allShort && lines.length >= 3) {
    return lines
      .map((l) => l.trim())
      .join(" ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }
  return prose.trim();
}

export { buildForgeTimeline } from "@/lib/timeline-builder";

/** Job ativo confirmado — sem flags stale fantasmas. */
export function hasActiveJob(
  progress: AgentProgress,
  opts?: { running?: boolean; slotActive?: boolean },
): boolean {
  return hasActiveJobInner(progress, opts);
}

function deriveMiniCardStatus(progress: AgentProgress, jobActive: boolean): MiniCardStatus {
  const terminalPhase = resolveTerminalPhase(progress);
  if (terminalPhase === "closing" || terminalPhase === "terminal") {
    if (progress.canceled || progress.lastFinishOk === false) {
      const lifecycle = resolveAgentLifecycle({
        progress,
        activeRunId: null,
        running: false,
      });
      if (lifecycle === "failed" || lifecycle === "stale" || lifecycle === "cancel") return "failed";
    }
    return "done";
  }
  const lifecycle = resolveAgentLifecycle({
    progress,
    activeRunId: null,
    running: jobActive,
  });
  if (lifecycle === "cancel" || lifecycle === "failed" || lifecycle === "stale") {
    return "failed";
  }
  if (lifecycle === "waiting_user" || lifecycle === "dispatch" || lifecycle === "running") {
    return jobActive ? "working" : "done";
  }
  if (lifecycle === "finish" || lifecycle === "complete") return "done";
  if (jobActive) return "working";
  return "done";
}

const TOOL_BRIEF_VERBS: Record<string, string> = {
  fs_read: "Lendo",
  fs_read_many: "Lendo arquivos",
  fs_list: "Listando",
  fs_search: "Buscando em",
  fs_glob: "Buscando",
  fs_write: "Criando",
  fs_edit: "Editando",
  shell_exec: "Executando",
  web_search: "Pesquisando",
  web_fetch: "Consultando",
  find_skills: "Buscando skills",
  load_skill: "Carregando skill",
  extract_design_dna: "Extraindo DesignDNA",
  read_design_library: "Lendo design library",
};

export function toolBriefing(name: string, path?: string, intent?: string): string {
  // Intenção explícita do agente (step_intent) vence — traduz o "porquê", não só o "o quê".
  if (intent && intent.trim()) {
    const t = intent.trim();
    return `${t.charAt(0).toUpperCase()}${t.slice(1)}…`;
  }
  const verb = TOOL_BRIEF_VERBS[name] ?? `Usando ${name}`;
  const file = path ? fileBase(path) : "";
  if (name === "shell_exec") return file ? `Executando ${file}…` : "Executando comando…";
  return file ? `${verb} ${file}…` : `${verb}…`;
}

/** Briefing do mini card — sem gather/explore genérico (só trabalho real). */
export function normalizeMiniCardBriefing(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  const sanitized = sanitizeRunText(t, 80);
  if (!sanitized) return null;
  if (/^explorando/i.test(t)) return null;
  if (/explorando(\s+o)?\s+projeto/i.test(t)) return null;
  if (/^indexando/i.test(t)) return null;
  if (/^lendo arquivos/i.test(t)) return null;
  if (/^lendo package\.json/i.test(t)) return null;
  if (/analisando(\s+o)?\s+projeto/i.test(t)) return null;
  if (/entender o que já existe/i.test(t)) return null;
  if (/entendendo o que já existe/i.test(t)) return null;
  if (/^avaliando o escopo/i.test(t)) return null;
  if (/^pensando[.…]*$/i.test(t)) return null;
  if (/retomando automaticamente/i.test(t)) return null;
  if (/retomando execução/i.test(t)) return null;
  if (/retomando do passo/i.test(t)) return null;
  if (/conectando ao agente/i.test(t)) return null;
  if (/^iniciando[.…]*$/i.test(t)) return null;
  return truncate(sanitized, 80);
}

function isInternalPhaseNoise(label: string, phase?: string): boolean {
  if (
    phase === "gather" ||
    phase === "classify" ||
    phase === "clarify" ||
    phase === "qualify" ||
    phase === "build" ||
    phase === "checkpoint" ||
    phase === "execute" ||
    phase === "execute_step" ||
    phase === "observe"
  ) {
    return true;
  }
  const t = label.trim();
  if (!t) return true;
  if (/^executando passo \d+/i.test(t)) return true;
  if (/\bpasso\s+\d+\s*\/\s*\d+\b/i.test(t)) return true;
  if (/retomando do passo \d+/i.test(t)) return true;
  if (/^concluído:/i.test(t)) return true;
  return normalizeMiniCardBriefing(t) === null;
}

/** Último briefing factual — só durante job ativo; sem carrossel de histórico. */
export function collectMiniCardBriefings(
  progress: AgentProgress,
  timeline: ForgeTimelineItem[],
  jobActive: boolean,
  _opts?: { userPrompt?: string | null; sessionTitle?: string | null },
): string[] {
  if (!jobActive) return [];

  const pendingTool = [...progress.tools].reverse().find((t) => t.ok === undefined);
  if (pendingTool) {
    const line = normalizeMiniCardBriefing(
      toolBriefing(pendingTool.name, pathFromArgs(pendingTool.args)),
    );
    if (line) return [line];
  }

  for (const item of [...timeline].reverse()) {
    if (item.type === "RESULT" && item.ok && item.text) {
      const line = normalizeMiniCardBriefing(item.text);
      if (line) return [line];
    }
    if (item.type === "READ" && item.path) {
      const line = normalizeMiniCardBriefing(toolBriefing("fs_read", item.path));
      if (line) return [line];
    }
    if (item.type === "LISTED" && item.path) {
      const line = normalizeMiniCardBriefing(toolBriefing("fs_list", item.path));
      if (line) return [line];
    }
    if (item.type === "CREATED" && item.path) {
      const line = normalizeMiniCardBriefing(toolBriefing("fs_write", item.path));
      if (line) return [line];
    }
    if (item.type === "EDITED" && item.path) {
      const line = normalizeMiniCardBriefing(toolBriefing("fs_edit", item.path));
      if (line) return [line];
    }
    if (item.type === "RUNNING" && item.command) {
      const line = normalizeMiniCardBriefing(toolBriefing("shell_exec", item.command));
      if (line) return [line];
    }
    if (item.type === "SKILL" && item.name) {
      const line = normalizeMiniCardBriefing(item.name);
      if (line) return [line];
    }
    if (item.type === "TASK") {
      const line = normalizeMiniCardBriefing(item.label);
      if (line) return [line];
    }
  }

  const activeThought = [...timeline].reverse().find((i) => i.type === "THOUGHT" && i.active);
  if (activeThought?.type === "THOUGHT") return ["Raciocinando…"];

  const planAwaiting =
    progress.awaitingKind === "plan_approval" && (progress.pendingPlan?.steps?.length ?? 0) > 0;
  if (progress.phase === "plan" || planAwaiting) return [""];

  return [];
}

/**
 * Activity stream humanizado — últimos 3-4 itens relevantes da timeline
 * com status visual (done/active/failed). Mostra o trabalho happening em
 * tempo real em vez de um briefing único raso.
 *
 * Sanitização mantida (explorar/indexar/classify continuam filtrados — ruído
 * interno). Inclui:
 *  - tool em execução (active) se houver
 *  - últimos tools/results finalizados (done)
 *  - falha recente (failed) se aplicável
 */
export function collectMiniCardActivity(
  progress: AgentProgress,
  timeline: ForgeTimelineItem[],
  jobActive: boolean,
): ForgeActivityLine[] {
  // Após término: mostra últimos 5 concluídos (ou falha) — snapshot final.
  const lines: ForgeActivityLine[] = [];

  // 1) Tool em execução AGORA (active) — topo do stream
  const pendingTool = [...progress.tools].reverse().find((t) => t.ok === undefined);
  if (pendingTool && jobActive) {
    const toolPath = pathFromArgs(pendingTool.args);
    const label = normalizeMiniCardBriefing(
      toolBriefing(pendingTool.name, toolPath),
    );
    if (label) {
      // id estável (sem Date.now) para evitar remount em cada re-render do live progress
      const argKey = JSON.stringify(pendingTool.args ?? {}).slice(0, 32);
      lines.push({
        id: `activity-active-${pendingTool.name}-${argKey}`,
        label,
        description: toolPath && toolPath.length > 30 ? toolPath : undefined,
        toolName: pendingTool.name,
        status: "active",
      });
    }
  }

  // 2) Últimos tools/results finalizados — histórico enxuto (done/failed)
  const seenLabels = new Set<string>();
  for (const item of [...timeline].reverse()) {
    if (lines.length >= 5) break;

    if (item.type === "RESULT" && item.text) {
      const label = normalizeMiniCardBriefing(item.text);
      if (label && !seenLabels.has(label)) {
        seenLabels.add(label);
        lines.push({
          id: item.id,
          label,
          description: item.evidence?.length ? item.evidence.slice(0, 2).join(", ") : undefined,
          status: item.ok === false ? "failed" : "done",
        });
        continue;
      }
    }

    if (
      (item.type === "READ" ||
        item.type === "LISTED" ||
        item.type === "CREATED" ||
        item.type === "EDITED" ||
        item.type === "RUNNING" ||
        item.type === "SKILL") &&
      item.ok !== undefined
    ) {
      let label: string | null = null;
      let description: string | undefined;
      let toolName: string | undefined;
      let path: string | undefined;
      let detail: string | undefined;

      switch (item.type) {
        case "READ":
          path = item.path;
          detail = item.detail;
          toolName = "fs_read";
          label = normalizeMiniCardBriefing(toolBriefing("fs_read", item.path));
          break;
        case "LISTED":
          path = item.path;
          detail = item.detail;
          toolName = "fs_list";
          label = normalizeMiniCardBriefing(toolBriefing("fs_list", item.path));
          break;
        case "CREATED":
          path = item.path;
          detail = item.detail;
          toolName = "fs_write";
          label = normalizeMiniCardBriefing(toolBriefing("fs_write", item.path));
          break;
        case "EDITED":
          path = item.path;
          detail = item.detail;
          toolName = "fs_edit";
          label = normalizeMiniCardBriefing(toolBriefing("fs_edit", item.path));
          break;
        case "RUNNING":
          path = item.command;
          detail = item.detail;
          toolName = "shell_exec";
          label = normalizeMiniCardBriefing(toolBriefing("shell_exec", item.command));
          break;
        case "SKILL":
          detail = item.detail;
          toolName = item.name;
          label = normalizeMiniCardBriefing(item.name);
          break;
      }

      if (label && !seenLabels.has(label)) {
        seenLabels.add(label);
        lines.push({
          id: item.id,
          label,
          description: path && path.length > 30 ? path : detail || undefined,
          toolName,
          status: item.ok === false ? "failed" : "done",
        });
        continue;
      }
    }
  }

  // 3) Fallback: thought ativo se nada mais sobreviveu à sanitização
  if (lines.length === 0) {
    const activeThought = [...timeline].reverse().find((i) => i.type === "THOUGHT" && i.active);
    if (activeThought?.type === "THOUGHT" && jobActive) {
      lines.push({ id: "activity-thinking", label: "Raciocinando…", status: "active" });
    }
  }

  return lines;
}

function isWrapUpPhrase(text: string): boolean {
  const normalized = text.replace(/\*+/g, "").trim();
  return /pronto!?\s*resumo do que fiz/i.test(normalized);
}

/** Título curto da sessão ao terminar — não repetir o corpo do chat. */
export function deriveSessionTitle(
  progress: AgentProgress,
  jobPlan?: PendingPlan | null,
  userPrompt?: string | null,
): string {
  const mission = jobPlan?.mission?.trim();
  if (mission && !isWrapUpPhrase(mission)) return mission;
  const planSummary = jobPlan?.summary?.trim();
  if (planSummary && !isWrapUpPhrase(planSummary)) return planSummary;
  const planSummaryProgress = progress.planSummary?.trim();
  if (planSummaryProgress && !isWrapUpPhrase(planSummaryProgress)) {
    return planSummaryProgress;
  }

  if (progress.diffs.length > 0) {
    return `Arquivos: ${progress.diffs.length}`;
  }

  if (progress.deliveryFiles?.length) {
    return `Arquivos: ${progress.deliveryFiles.length}`;
  }

  if (!progress.finished) return "Working";

  return "Sessão concluída";
}

export function deriveBrainstormTitle(userPrompt?: string | null): string {
  const raw = userPrompt?.trim();
  if (!raw) return "Brainstorm";
  let topic = raw
    .replace(/^(quero|preciso|crie|criar|faz|faça|monte|montar)\s+(um|uma)?\s*/i, "")
    .replace(/[.?!].*$/s, "")
    .trim();
  if (!topic) return "Brainstorm";
  topic = topic.charAt(0).toLowerCase() + topic.slice(1);
  return `Brainstorm de ${truncate(topic, 48)}`;
}

function lastEditedFile(progress: AgentProgress): string | null {
  for (let i = progress.diffs.length - 1; i >= 0; i--) {
    const d = progress.diffs[i];
    if (d?.path) return fileBase(d.path);
  }
  for (let i = progress.tools.length - 1; i >= 0; i--) {
    const t = progress.tools[i];
    const name = t?.name;
    if (name === "fs_write" || name === "fs_edit") {
      const path = pathFromArgs(t.args);
      if (path) return fileBase(path);
    }
  }
  return null;
}

function hasActiveShellTool(progress: AgentProgress): boolean {
  return progress.tools.some((t) => t.name === "shell_exec" && t.ok === undefined);
}

/** Header + subtitle do mini-card no estilo Lovable. */
export function buildMiniCardHeader(
  progress: AgentProgress,
  running: boolean,
  opts: {
    editedFile?: string | null;
    liveBriefings: string[];
    sessionTitle: string;
    planDriven?: boolean;
    forgeTimeline?: ForgeTimelineItem[];
  },
): { header: string; subtitle: string } {
  const edited = opts.editedFile?.trim();
  const subtitle = opts.liveBriefings[0] ?? opts.sessionTitle;
  const liveAction = projectActionLedgerLine({
    progress,
    forgeTimeline: opts.forgeTimeline,
    jobActive: running,
  });

  if (edited && (running || !progress.finished)) {
    return { header: `Edited ${edited}`, subtitle };
  }
  if (hasActiveShellTool(progress) && running && !liveAction) {
    return { header: "Running command", subtitle };
  }
  if (hasActiveShellTool(progress) && running && liveAction) {
    return { header: liveAction, subtitle };
  }
  const lifecycle = resolveAgentLifecycle({
    progress,
    activeRunId: null,
    running,
  });
  if (lifecycle === "dispatch" && !edited) {
    return { header: lifecycleLabel(lifecycle), subtitle };
  }
  if (lifecycle === "waiting_user" && !edited) {
    return { header: lifecycleLabel(lifecycle), subtitle };
  }
  if (lifecycle === "finish" && !edited) {
    return { header: lifecycleLabel(lifecycle), subtitle };
  }
  if (progress.finished && edited) {
    return { header: `Edited ${edited}`, subtitle: opts.sessionTitle };
  }
  if (progress.finished && liveAction) {
    return { header: liveAction, subtitle: opts.sessionTitle };
  }
  if (running) {
    if (liveAction) return { header: liveAction, subtitle };
    // Estado «Pensando…» fica na linha do chat — card só com conteúdo factual.
    return { header: "", subtitle };
  }
  return { header: opts.sessionTitle, subtitle };
}

export function isRunEffectivelyActive(progress: AgentProgress, slotActive = false): boolean {
  return hasActiveJob(progress, { running: true, slotActive });
}

/**
 * Mini-card após narração (FRONTEND_REFACTOR_PLAN): Thought → narração LLM → card → fechamento.
 */
export function shouldShowJobCard(opts: {
  runId?: string;
  progress: AgentProgress | null;
  /** Turno só com clarify — sem mini-card. */
  isClarifyOnly: boolean;
  isAgentJobMessage: boolean;
  hasExecutionEvidence: boolean;
  slotActive: boolean;
  activeRunId?: string | null;
}): boolean {
  const { runId, progress, isClarifyOnly, slotActive } = opts;

  if (!runId || !progress || isClarifyOnly) return false;
  if (progress.conversational === true) return false;
  if (runId === "__pending__") return false;

  const planApprovalOnly =
    progress.awaitingKind === "plan_approval" &&
    (progress.pendingPlan?.steps?.length ?? 0) > 0 &&
    (progress.diffs?.length ?? 0) === 0 &&
    !lastEditedFile(progress) &&
    !hasActiveShellTool(progress);
  if (planApprovalOnly) return false;

  const jobActive = hasActiveJob(progress, { running: true, slotActive });
  if (jobActive) return true;

  const edited = lastEditedFile(progress);

  if (edited && (jobActive || !progress.finished)) return true;
  if (hasActiveShellTool(progress) && jobActive) return true;

  if (progress.finished && progress.lastFinishOk !== false) {
    if ((progress.diffs?.length ?? 0) > 0 || (progress.deliveryFiles?.length ?? 0) > 0) {
      return true;
    }
    if (edited) return true;
  }

  // Mini-card permanente: job materializado no DB mantém o card após terminar.
  if (progress.finished && opts.isAgentJobMessage) {
    return true;
  }

  return false;
}

/** Uma linha viva rotativa — o que o job está fazendo AGORA. Derivada da timeline
 *  canônica + tasks declaradas + tools em execução. Nunca uma lista crua de tools. */
export function collectMiniCardLiveLine(
  progress: AgentProgress,
  timeline: ForgeTimelineItem[],
  jobActive: boolean,
): string {
  const projected = projectActionLedgerLine({
    progress,
    forgeTimeline: timeline,
    jobActive,
  });
  if (projected) return projected;
  if (!jobActive) return "Concluído";
  return "Trabalhando…";
}

export function buildAgentRunView(
  runId: string,
  progress: AgentProgress,
  opts?: {
    running?: boolean;
    jobPlan?: PendingPlan | null;
    userPrompt?: string | null;
    /** Timestamp client-side — início do thinking de latência (~500ms após envio). */
    runStartedAtMs?: number | null;
  },
): AgentRunView {
  const slotActive = !!opts?.running;
  const jobActive = hasActiveJob(progress, { running: true, slotActive });
  const jobPlan = opts?.jobPlan ?? progress.pendingPlan;
  const preserveFailedTimeline = progress.finished && progress.lastFinishOk === false;
  const forgeTimeline = buildForgeTimeline(progress.timeline, jobActive || preserveFailedTimeline);

  const status = deriveMiniCardStatus(progress, jobActive);
  const editedFile = lastEditedFile(progress);
  const sessionTitle = deriveSessionTitle(progress, jobPlan, opts?.userPrompt);
  const liveBriefings = collectMiniCardBriefings(progress, forgeTimeline, jobActive, {
    userPrompt: opts?.userPrompt,
    sessionTitle,
  });
  const normalizedBriefings =
    liveBriefings.length > 0
      ? liveBriefings
      : jobActive && jobPlan?.steps?.length
        ? ["Executando plano"]
        : liveBriefings;
  const activity = collectMiniCardActivity(progress, forgeTimeline, jobActive);
  const liveLine = collectMiniCardLiveLine(progress, forgeTimeline, jobActive);

  // Tasks checklist — only build materialized flow or explicit declare_tasks.
  const tasks = derivePlanTasks(jobPlan, progress, jobActive);

  const streamBody = progress.streamText?.trim() || null;
  const narrationBody = progress.narrationText?.trim() || null;
  const summaryBody = progress.summary?.trim();
  const safeSummary = summaryBody && !isWrapUpPhrase(summaryBody) ? summaryBody : null;
  // Fase 1.8 — dedupe mais rigoroso: igual OU prefix match OU includes.
  // O caso "streamBody.startsWith(narrationBody)" é o bug típico — o agente
  // emite "Vou criar a landing" como narration, depois repete a mesma frase
  // caractere a caractere como streamText. Sem prefix-match, ambas viram
  // visíveis (a linha de narração E o closing text).
  const narrationDuplicatesStream =
    !!streamBody &&
    !!narrationBody &&
    (narrationBody === streamBody ||
      streamBody.startsWith(narrationBody) ||
      streamBody.includes(narrationBody) ||
      narrationBody.includes(streamBody));
  if (narrationDuplicatesStream && streamBody && narrationBody) {
    emitStreamingTelemetry("agent.narration_stream_overlap", {
      streamLength: streamBody.length,
      narrationLength: narrationBody.length,
      overlapType: streamBody.startsWith(narrationBody)
        ? "stream_starts_with_narration"
        : streamBody.includes(narrationBody)
          ? "stream_contains_narration"
          : narrationBody.includes(streamBody)
            ? "narration_contains_stream"
            : "exact",
    });
  }
  const closingText =
    streamBody ||
    (!jobActive && !narrationDuplicatesStream ? narrationBody || safeSummary : null) ||
    null;
  const narrationForLine =
    narrationBody && narrationBody !== sessionTitle && !narrationDuplicatesStream
      ? narrationBody
      : null;

  const { header, subtitle } = buildMiniCardHeader(progress, jobActive, {
    editedFile,
    liveBriefings: normalizedBriefings,
    sessionTitle,
    planDriven: !!jobPlan?.steps?.length,
    forgeTimeline,
  });

  // Fase 2.2 — extrai o último tool executado (reverso do forgeTimeline) para
  // action chips no mini card. Ignora tools ativos (active=true) — só
  // mostramos chips para tools que terminaram.
  const lastToolItem = [...forgeTimeline]
    .reverse()
    .find(
      (t) =>
        (t.type === "READ" ||
          t.type === "LISTED" ||
          t.type === "CREATED" ||
          t.type === "EDITED" ||
          t.type === "RUNNING" ||
          t.type === "SKILL") &&
        !t.active,
    ) as
    | (Extract<ForgeTimelineItem, { type: "READ" }> & { active: false })
    | (Extract<ForgeTimelineItem, { type: "LISTED" }> & { active: false })
    | (Extract<ForgeTimelineItem, { type: "CREATED" }> & { active: false })
    | (Extract<ForgeTimelineItem, { type: "EDITED" }> & { active: false })
    | (Extract<ForgeTimelineItem, { type: "RUNNING" }> & { active: false })
    | (Extract<ForgeTimelineItem, { type: "SKILL" }> & { active: false })
    | undefined;
  const lastTool = lastToolItem
    ? {
        name:
          lastToolItem.type === "READ"
            ? "fs_read"
            : lastToolItem.type === "LISTED"
              ? "fs_list"
              : lastToolItem.type === "CREATED"
                ? "fs_write"
                : lastToolItem.type === "EDITED"
                  ? "fs_edit"
                  : lastToolItem.type === "RUNNING"
                    ? "shell_exec"
                    : lastToolItem.type === "SKILL"
                      ? lastToolItem.name
                      : "tool",
        path:
          lastToolItem.type === "RUNNING"
            ? lastToolItem.command
            : "path" in lastToolItem
              ? lastToolItem.path
              : undefined,
        ok: true,
      }
    : null;

  return {
    runId,
    miniCard: {
      title: sessionTitle,
      header,
      subtitle,
      liveBriefings: normalizedBriefings,
      liveLine,
      status,
      activity,
      tasks,
      editedFile,
      fileCount: progress.diffs.length || progress.deliveryFiles?.length,
      hasPlan: !!jobPlan?.steps?.length,
      lastTool,
    },
    narration: narrationForLine,
    closingText,
    timeline: forgeTimeline,
    error: progress.error,
    finished: progress.finished,
    lastFinishOk: progress.lastFinishOk,
    resumable: progress.resumable,
    conversational: progress.conversational === true,
  };
}

export type ForgePlanAction = "approve" | "reject" | "edit";

export function enabledPlanSteps(steps: PlanStep[]): PlanStep[] {
  const enabled = steps.filter((s) => s.enabled);
  return enabled.length > 0 ? enabled : steps;
}
