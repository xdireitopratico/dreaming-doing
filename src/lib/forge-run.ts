import type { AgentProgress, PendingPlan, PlanStep, SSEEvent } from "@/lib/agent-progress";
import { lifecycleLabel, resolveAgentLifecycle } from "@/lib/agent-lifecycle";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";
import { checkpointSummary, formatSkillInvocation, sanitizeRunText } from "@/lib/run-story-hygiene";
import { isToolDoneEvent, isToolDoneOk, toolDoneName } from "@/lib/timeline-tool-events";

export type MiniCardStatus = "thinking" | "working" | "done" | "failed";
export type MiniCardTaskStatus = "done" | "active" | "pending" | "failed";

export type ForgeMiniCardTask = {
  id: string;
  label: string;
  status: MiniCardTaskStatus;
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
  tasks: ForgeMiniCardTask[];
  currentTaskIndex: number;
  editedFile?: string | null;
  fileCount?: number;
  hasPlan?: boolean;
  /** Fase 2.2 — action chips: o último tool executado vira chip clicável
   *  no mini card (Show file / Show diff / Show output / Show preview). */
  lastTool?: {
    name: string;
    path?: string;
    ok?: boolean;
  } | null;
};

export type TimelineItemType = "TASK" | "THOUGHT" | "TOOL" | "RESULT";

export type ForgeTimelineItem =
  | { type: "TASK"; id: string; label: string }
  | {
      type: "THOUGHT";
      id: string;
      durationMs: number;
      text: string;
      active?: boolean;
      startedAtMs?: number;
    }
  | {
      type: "TOOL";
      id: string;
      name: string;
      path?: string;
      detail?: string;
      active?: boolean;
      ok?: boolean;
    }
  | { type: "RESULT"; id: string; ok: boolean; text: string; evidence?: string[] };

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

export function buildForgeTimeline(timeline: SSEEvent[], running = false): ForgeTimelineItem[] {
  const items: ForgeTimelineItem[] = [];
  let thoughtId: string | null = null;
  let thoughtStart = 0;
  let thoughtText = "";
  let lastThoughtTs = 0;
  let lastThoughtText = "";
  const hasThinkingText = timeline.some((ev) => ev.type === "thinking_text");

  const flushThought = (endTs: number) => {
    if (!thoughtId) return;
    const durationMs = Math.max(1000, endTs - thoughtStart);
    items.push({
      type: "THOUGHT",
      id: thoughtId,
      durationMs,
      text: normalizeProse(thoughtText),
      startedAtMs: thoughtStart,
    });
    thoughtId = null;
    thoughtText = "";
    lastThoughtTs = 0;
    lastThoughtText = "";
  };

  for (const ev of timeline) {
    const data = ev.data ?? {};
    const ts = ev.timestamp;

    if (ev.type === "assistant_text" || ev.type === "thinking_text") {
      const isThinkingText = ev.type === "thinking_text";
      const isLegacyThought = ev.type === "assistant_text" && isInspectorThought(data);
      if (isThinkingText || (!hasThinkingText && isLegacyThought)) {
        const chunk = String(data.text ?? "");
        if (!chunk) continue;
        if (ts === lastThoughtTs && chunk === lastThoughtText) continue;
        lastThoughtTs = ts;
        lastThoughtText = chunk;

        if (!thoughtId) {
          thoughtId = `thought-${ts}`;
          thoughtStart = ts;
          thoughtText = chunk;
        } else {
          thoughtText += chunk;
        }
      }
      continue;
    }

    if (ev.type === "step_result") {
      if (thoughtId) flushThought(ts);
      const ok = data.ok !== false;
      const text = typeof data.summary === "string" ? data.summary : ok ? "Concluído" : "Falhou";
      const evidence = Array.isArray(data.evidence)
        ? (data.evidence as string[]).filter((e) => typeof e === "string")
        : undefined;
      items.push({
        type: "RESULT",
        id: `result-${ts}`,
        ok,
        text,
        evidence: evidence?.length ? evidence : undefined,
      });
      continue;
    }

    if (thoughtId) flushThought(ts);

    if (ev.type === "explore") {
      const label = sanitizeRunText(data.message);
      if (label) {
        items.push({ type: "TASK", id: `explore-${ts}`, label: truncate(label, 120) });
      }
      continue;
    }

    if (
      ev.type === "timeout_warning" ||
      ev.type === "heartbeat" ||
      ev.type === "stuck" ||
      ev.type === "error"
    ) {
      const label = sanitizeRunText(data.message) ?? sanitizeRunText(data.error);
      if (label) {
        items.push({ type: "TASK", id: `status-${ts}`, label: truncate(label, 120) });
      }
      continue;
    }

    if (ev.type === "phase" || ev.type === "memory") {
      const phase = typeof data.phase === "string" ? data.phase : undefined;
      const label = sanitizeRunText(data.message ?? data.phase);
      if (!label || isInternalPhaseNoise(label, phase)) continue;
      items.push({ type: "TASK", id: `task-${ts}`, label: truncate(label, 120) });
      continue;
    }

    if (ev.type === "checkpoint_resume" || ev.type === "delivery_checkpoint_silent") {
      continue;
    }

    if (ev.type === "tool_start" || ev.type === "tool_call") {
      const name = String(data.name ?? data.tool ?? "tool");
      const args = (data.args ?? data.input) as Record<string, unknown> | undefined;
      const path = pathFromArgs(args);
      items.push({
        type: "TOOL",
        id: `tool-${ts}`,
        name,
        path: path || undefined,
        detail: path ? undefined : JSON.stringify(args ?? {}).slice(0, 200),
        active: running,
      });
      continue;
    }

    if (isToolDoneEvent(ev)) {
      const ok = isToolDoneOk(data);
      const toolName = toolDoneName(data);
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item?.type !== "TOOL") continue;
        items[i] = { ...item, name: toolName, active: false, ok };
        break;
      }
      if (ev.type !== "tool_done") {
        const text =
          typeof data.summary === "string" ? data.summary : ok ? "Concluído" : "Erro";
        items.push({ type: "RESULT", id: `result-${ts}`, ok, text });
      }
      continue;
    }

    if (ev.type === "delivery_checkpoint") {
      const checkpoint = checkpointSummary(data);
      if (!checkpoint) continue;
      items.push({
        type: "RESULT",
        id: `result-${ts}`,
        ok: true,
        text: checkpoint.text,
        evidence: checkpoint.files.map(fileBase),
      });
      continue;
    }

    if (ev.type === "error") {
      items.push({
        type: "RESULT",
        id: `error-${ts}`,
        ok: false,
        text: typeof data.message === "string" ? data.message.slice(0, 200) : "Erro",
      });
      continue;
    }

    if (ev.type === "classify") {
      continue;
    }

    if (ev.type === "skills") {
      const label = formatSkillInvocation(data);
      if (label) {
        items.push({ type: "TASK", id: `skills-${ts}`, label });
      }
      continue;
    }

    if (ev.type === "build_log") {
      const command = typeof data.command === "string" ? data.command : "build";
      const ok = data.ok !== false;
      items.push({
        type: "RESULT",
        id: `build-${ts}`,
        ok,
        text: `Build: ${ok ? "Ok" : "Erro"}`,
      });
      continue;
    }

    if (ev.type === "file_diff") {
      const path = typeof data.path === "string" ? data.path : "";
      const op = typeof data.op === "string" ? data.op : "edit";
      if (path) {
        const label = op === "write" ? fileBase(path) : fileBase(path);
        items.push({ type: "TASK", id: `diff-${ts}`, label: truncate(label, 120) });
      }
      continue;
    }

    if (ev.type === "typecheck_fail") {
      const errors = Array.isArray(data.errors) ? data.errors : [];
      items.push({
        type: "RESULT",
        id: `typecheck-${ts}`,
        ok: false,
        text: `TS: ${errors.length} erro(s)`,
      });
      continue;
    }

    if (ev.type === "fsm_transition") {
      continue;
    }

    if (ev.type === "plan_proposed") {
      const summary = typeof data.summary === "string" ? data.summary : "Plano";
      items.push({ type: "TASK", id: `plan-${ts}`, label: truncate(summary, 120) });
      continue;
    }

    if (ev.type === "gate_decision") {
      const awaiting = data.awaiting === true;
      items.push({
        type: "TASK",
        id: `gate-${ts}`,
        label: awaiting ? "Aguardando" : "Decidido",
      });
      continue;
    }

    if (ev.type === "rate_limit") {
      items.push({ type: "TASK", id: `rate-${ts}`, label: "Rate limit" });
      continue;
    }

    if (ev.type === "robin_rotate") {
      items.push({ type: "TASK", id: `robin-${ts}`, label: "Robin rotating API key" });
      continue;
    }

    if (ev.type === "connection_retry") {
      items.push({ type: "TASK", id: `retry-${ts}`, label: "Reconectando…" });
      continue;
    }

    if (ev.type === "context_pressure") {
      const message = sanitizeRunText(data.message);
      if (message)
        items.push({ type: "TASK", id: `pressure-${ts}`, label: truncate(message, 120) });
      continue;
    }

    if (ev.type === "context_compress") {
      continue;
    }

    if (ev.type === "start") {
      continue;
    }

    if (ev.type === "resume") {
      continue;
    }

    if (ev.type === "canceled") {
      const message = typeof data.message === "string" ? data.message : "Cancelado";
      items.push({
        type: "RESULT",
        id: `canceled-${ts}`,
        ok: false,
        text: truncate(message, 120),
      });
      continue;
    }
  }

  if (thoughtId) {
    const lastEventTs = timeline.at(-1)?.timestamp ?? thoughtStart;
    const staleMs = running ? Date.now() - lastEventTs : 0;
    const active = running && staleMs < 12_000;
    const endTs = active ? Date.now() : Math.max(thoughtStart + 1000, lastEventTs);
    const durationMs = Math.max(1000, endTs - thoughtStart);
    items.push({
      type: "THOUGHT",
      id: thoughtId,
      durationMs,
      text: normalizeProse(thoughtText),
      active,
      startedAtMs: thoughtStart,
    });
  }

  return items;
}

/** Job ativo confirmado — sem autoResuming nem flags stale. */
export function hasActiveJob(
  progress: AgentProgress,
  opts?: { running?: boolean; slotActive?: boolean },
): boolean {
  if (progress.finished || progress.canceled || progress.awaiting) return false;
  if (progress.awaitingKind === "plan_approval" || progress.awaitingKind === "clarify") {
    return false;
  }
  return !!(opts?.running && opts?.slotActive);
}

function deriveMiniCardStatus(progress: AgentProgress, jobActive: boolean): MiniCardStatus {
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
};

export function toolBriefing(name: string, path?: string): string {
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
    if (item.type === "TOOL") {
      const line = normalizeMiniCardBriefing(toolBriefing(item.name, item.path));
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

function normalizePlanTaskLabel(description: string): string {
  const label = description
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(label || "", 58);
}

function deriveMiniCardTasks(
  progress: AgentProgress,
  jobPlan: PendingPlan | null | undefined,
  jobActive: boolean,
): { tasks: ForgeMiniCardTask[]; currentTaskIndex: number } {
  const steps = (jobPlan?.steps ?? []).filter((step) => step.enabled !== false);
  if (steps.length === 0) return { tasks: [], currentTaskIndex: -1 };

  const rawCurrent =
    typeof progress.currentStep === "number" && Number.isFinite(progress.currentStep)
      ? progress.currentStep
      : null;
  const currentTaskIndex =
    rawCurrent == null
      ? jobActive
        ? 0
        : progress.finished && progress.lastFinishOk !== false
          ? steps.length - 1
          : -1
      : Math.max(0, Math.min(steps.length - 1, rawCurrent > 0 ? rawCurrent - 1 : rawCurrent));

  const tasks = steps.map((step, index): ForgeMiniCardTask => {
    let status: MiniCardTaskStatus = "pending";
    if (progress.finished) {
      status =
        progress.lastFinishOk === false && index >= Math.max(0, currentTaskIndex)
          ? "failed"
          : "done";
    } else if (jobActive) {
      if (index < currentTaskIndex) status = "done";
      else if (index === currentTaskIndex) status = "active";
    }
    return {
      id: step.id || `plan-step-${index}`,
      label: normalizePlanTaskLabel(step.description),
      status,
    };
  });

  return { tasks, currentTaskIndex };
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
  },
): { header: string; subtitle: string } {
  const edited = opts.editedFile?.trim();
  const subtitle = opts.liveBriefings[0] ?? opts.sessionTitle;

  if (edited && (running || !progress.finished)) {
    return { header: `Edited ${edited}`, subtitle };
  }
  if (hasActiveShellTool(progress) && running) {
    return { header: "Running command", subtitle };
  }
  if (opts.planDriven && running) {
    return { header: "Reading approved plan", subtitle };
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
  if (running) {
    return { header: "Working", subtitle };
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
  const forgeTimeline = buildForgeTimeline(progress.timeline, jobActive);

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
  const { tasks, currentTaskIndex } = deriveMiniCardTasks(progress, jobPlan, jobActive);

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
  });

  // Fase 2.2 — extrai o último TOOL executado (reverso do forgeTimeline) para
  // action chips no mini card. Ignora TOOLs ativos (active=true) — só
  // mostramos chips para tools que terminaram.
  const lastToolItem = [...forgeTimeline].reverse().find((t) => t.type === "TOOL" && !t.active) as
    | Extract<ForgeTimelineItem, { type: "TOOL" }>
    | undefined;
  const lastTool = lastToolItem
    ? { name: lastToolItem.name, path: lastToolItem.path, ok: true }
    : null;

  return {
    runId,
    miniCard: {
      title: sessionTitle,
      header,
      subtitle,
      liveBriefings: normalizedBriefings,
      status,
      tasks,
      currentTaskIndex,
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
