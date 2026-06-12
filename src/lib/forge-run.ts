import type { AgentProgress, PendingPlan, PlanStep, SSEEvent } from "@/lib/agent-progress";
import { planHeadlineFromPlan } from "@/lib/plan-message-meta";

export type TaskStatus = "pending" | "active" | "done" | "failed";

export type ForgeTaskItem = {
  id: string;
  label: string;
  status: TaskStatus;
};

export type MiniCardStatus = "thinking" | "working" | "done" | "failed";

export type ForgeMiniCardData = {
  /** Título da sessão quando terminal (ex.: «Brainstorm de app mobile»). */
  title: string;
  /** Header Lovable: «Edited App.tsx», «Running command», «Plan ready». */
  header: string;
  /** Subtitle rotativo — briefing da tarefa ativa. */
  subtitle: string;
  /** Briefings rotativos enquanto o job está ativo — resumo miniatura da timeline. */
  liveBriefings: string[];
  status: MiniCardStatus;
  tasks: ForgeTaskItem[];
  currentTaskIndex: number;
  editedFile?: string | null;
  fileCount?: number;
  hasPlan?: boolean;
  planReady?: boolean;
};

export type TimelineItemType = "TASK" | "THOUGHT" | "TOOL" | "RESULT";

export type ForgeTimelineItem =
  | { type: "TASK"; id: string; label: string }
  | { type: "THOUGHT"; id: string; durationMs: number; text: string; active?: boolean }
  | { type: "TOOL"; id: string; name: string; path?: string; detail?: string; active?: boolean }
  | { type: "RESULT"; id: string; ok: boolean; text: string; evidence?: string[] };

/** Timer imediato ao enviar mensagem — congela e permanece no chat. */
export type LatencyThinking = {
  active: boolean;
  startedAtMs: number;
  /** Duração fixa após congelar — «Thought for Xs» permanente. */
  durationMs?: number;
};

/** Raciocínio interno (thinking:true SSE) — «Thought for Xs» no inspector. */
export type ReasoningThought = {
  active: boolean;
  durationMs: number;
};

export type AgentRunView = {
  runId: string;
  miniCard: ForgeMiniCardData;
  /** @deprecated use latencyThinking / reasoningThought */
  thinking: { active: boolean; durationMs: number; text?: string } | null;
  latencyThinking: LatencyThinking | null;
  reasoningThought: ReasoningThought | null;
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

function isNarration(data: Record<string, unknown>): boolean {
  return data.narration === true;
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

  const flushThought = (endTs: number) => {
    if (!thoughtId) return;
    const durationMs = Math.max(1000, endTs - thoughtStart);
    items.push({
      type: "THOUGHT",
      id: thoughtId,
      durationMs,
      text: normalizeProse(thoughtText),
    });
    thoughtId = null;
    thoughtText = "";
  };

  for (const ev of timeline) {
    const data = ev.data ?? {};
    const ts = ev.timestamp;

    if (ev.type === "assistant_text") {
      if (isNarration(data) || isInspectorThought(data)) {
        const chunk = String(data.text ?? "");
        if (!chunk) continue;
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

    if (thoughtId) flushThought(ts);

    if (ev.type === "phase" || ev.type === "memory" || ev.type === "explore") {
      const phase =
        typeof data.phase === "string"
          ? data.phase
          : ev.type === "explore"
            ? "explore"
            : undefined;
      const label =
        typeof data.message === "string"
          ? data.message
          : typeof data.phase === "string"
            ? data.phase
            : "Task";
      if (isInternalPhaseNoise(label, phase)) continue;
      items.push({ type: "TASK", id: `task-${ts}`, label: truncate(label, 120) });
      continue;
    }

    if (ev.type === "checkpoint_resume" || ev.type === "delivery_checkpoint_silent") {
      items.push({ type: "TASK", id: `task-${ts}`, label: "Retomando execução" });
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
      });
      continue;
    }

    if (ev.type === "tool_result" || ev.type === "tool_end") {
      const ok = data.ok !== false && data.error == null;
      const text =
        typeof data.summary === "string"
          ? data.summary
          : ok
            ? "Concluído"
            : String(data.error ?? "Falhou");
      items.push({ type: "RESULT", id: `result-${ts}`, ok, text });
      continue;
    }

    if (ev.type === "delivery_checkpoint") {
      const files = Array.isArray(data.files) ? (data.files as string[]) : [];
      items.push({
        type: "RESULT",
        id: `result-${ts}`,
        ok: true,
        text: files.length ? `Checkpoint · ${files.length} arquivo(s)` : "Checkpoint salvo",
        evidence: files.map(fileBase),
      });
      continue;
    }

    if (ev.type === "error") {
      items.push({
        type: "RESULT",
        id: `error-${ts}`,
        ok: false,
        text: typeof data.message === "string" ? data.message.slice(0, 200) : "Erro na execução",
      });
    }
  }

  if (thoughtId) {
    const endTs = running ? Date.now() : (timeline.at(-1)?.timestamp ?? Date.now());
    const durationMs = Math.max(1000, endTs - thoughtStart);
    items.push({
      type: "THOUGHT",
      id: thoughtId,
      durationMs,
      text: normalizeProse(thoughtText),
      active: running,
    });
  }

  return items;
}

export function deriveTasksFromPlan(
  plan: PendingPlan,
  progress: AgentProgress,
  opts?: { planTeaser?: boolean },
): ForgeTaskItem[] {
  if (opts?.planTeaser || progress.awaitingKind === "plan_approval") {
    return enabledPlanSteps(plan.steps)
      .slice(0, 4)
      .map((step) => ({
        id: step.id,
        label: step.description,
        status: "pending" as const,
      }));
  }
  const current = progress.currentStep ?? 0;
  const executing = progress.phase === "execute" && !progress.finished;
  const succeeded = progress.finished && progress.lastFinishOk !== false && !progress.canceled;
  const failed = progress.finished && (progress.lastFinishOk === false || !!progress.canceled);

  return enabledPlanSteps(plan.steps)
    .slice(0, 6)
    .map((step, idx) => {
      let status: TaskStatus = "pending";
      if (succeeded) status = "done";
      else if (failed && idx === current) status = "failed";
      else if (executing && idx < current) status = "done";
      else if (executing && idx === current) status = "active";
      return { id: step.id, label: step.description, status };
    });
}

function deriveMiniCardStatus(progress: AgentProgress, running: boolean): MiniCardStatus {
  if (progress.canceled || (progress.finished && progress.lastFinishOk === false)) {
    return "failed";
  }
  if (progress.finished && progress.error && progress.resumable) return "failed";
  if (progress.finished) return "done";
  if (running || progress.autoResuming) return "working";
  return "working";
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

/** 1º token no inspector ou no chat — congela Thinking → Thought for Xs. */
export function hasFirstInspectorToken(progress: AgentProgress): boolean {
  if (progress.streamText?.trim() || progress.narrationText?.trim()) return true;
  return progress.timeline.some(
    (ev) =>
      ev.type === "assistant_text" &&
      typeof ev.data?.text === "string" &&
      String(ev.data.text).trim().length > 0,
  );
}

/** Think latency — congela ao 1º token e permanece no chat (append-only). */
export function resolveLatencyThinking(
  progress: AgentProgress,
  running: boolean,
  runStartedAtMs: number | null | undefined,
  forgeTimeline?: ForgeTimelineItem[],
): LatencyThinking | null {
  const storedMs = progress.latencyThoughtMs;
  if (storedMs != null && storedMs > 0) {
    return {
      active: false,
      startedAtMs: runStartedAtMs ?? Date.now() - storedMs,
      durationMs: storedMs,
    };
  }

  if (!runStartedAtMs) return null;

  const timeline = forgeTimeline ?? buildForgeTimeline(progress.timeline, running);
  const thoughtItems = timeline.filter((i) => i.type === "THOUGHT");
  const shouldFreeze = hasFirstInspectorToken(progress) || thoughtItems.length > 0;

  if (shouldFreeze) {
    const durationMs = Math.max(500, Date.now() - runStartedAtMs);
    return { active: false, startedAtMs: runStartedAtMs, durationMs };
  }

  if (!running) return null;

  return { active: true, startedAtMs: runStartedAtMs };
}

export function hasInspectorThoughtStream(progress: AgentProgress): boolean {
  return progress.timeline.some(
    (ev) =>
      ev.type === "assistant_text" &&
      ev.data?.thinking === true &&
      typeof ev.data?.text === "string" &&
      String(ev.data.text).trim().length > 0,
  );
}

/** Briefing do mini card — sem gather/explore genérico (só trabalho real). */
export function normalizeMiniCardBriefing(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
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
  return truncate(t, 80);
}

function isInternalPhaseNoise(label: string, phase?: string): boolean {
  if (
    phase === "gather" ||
    phase === "explore" ||
    phase === "classify" ||
    phase === "qualify"
  ) {
    return true;
  }
  const t = label.trim();
  if (!t) return true;
  return normalizeMiniCardBriefing(t) === null;
}

/** Briefings humanos derivados da timeline — rotacionam no mini card durante a run. */
export function collectMiniCardBriefings(
  progress: AgentProgress,
  timeline: ForgeTimelineItem[],
  tasks: ForgeTaskItem[],
  running: boolean,
  opts?: { userPrompt?: string | null; sessionTitle?: string | null },
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  const push = (line: string) => {
    const t = normalizeMiniCardBriefing(line);
    if (!t || seen.has(t)) return;
    seen.add(t);
    lines.push(t);
  };

  const activeThought = [...timeline].reverse().find((i) => i.type === "THOUGHT" && i.active);
  if (activeThought?.type === "THOUGHT") push("Raciocinando…");

  const pendingTool = [...progress.tools].reverse().find((t) => t.ok === undefined);
  if (pendingTool) {
    push(toolBriefing(pendingTool.name, pathFromArgs(pendingTool.args)));
  }

  const activeTask = tasks.find((t) => t.status === "active");
  if (activeTask) push(activeTask.label);

  for (const item of [...timeline].reverse()) {
    if (item.type === "TOOL") push(toolBriefing(item.name, item.path));
    if (item.type === "TASK") push(item.label);
    if (item.type === "RESULT" && item.ok && item.text) push(item.text);
  }

  const planAwaiting =
    progress.awaitingKind === "plan_approval" && (progress.pendingPlan?.steps?.length ?? 0) > 0;

  if (progress.phase === "plan" || planAwaiting) push("Plano aguardando revisão…");

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
    return `Entrega · ${progress.diffs.length} arquivo(s)`;
  }

  if (progress.deliveryFiles?.length) {
    return `Entrega · ${progress.deliveryFiles.length} arquivo(s)`;
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
    planReady?: boolean;
    planHeadline?: string;
    briefingIndex?: number;
  },
): { header: string; subtitle: string } {
  const edited = opts.editedFile?.trim();
  const briefings = opts.liveBriefings.length > 0 ? opts.liveBriefings : [opts.sessionTitle];
  const idx = opts.briefingIndex ?? 0;
  const subtitle = briefings[idx % briefings.length] ?? opts.sessionTitle;

  if (opts.planReady) {
    return {
      header: "Plan ready",
      subtitle: opts.planHeadline?.trim() || subtitle,
    };
  }
  if (edited && (running || !progress.finished)) {
    return { header: `Edited ${edited}`, subtitle };
  }
  if (hasActiveShellTool(progress) && running) {
    return { header: "Running command", subtitle };
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
  return !!slotActive && !progress.finished && !progress.canceled;
}

/**
 * Mini-card após narração (FRONTEND_REFACTOR_PLAN): Thought → narração LLM → card → fechamento.
 */
export function shouldShowJobCard(opts: {
  runId?: string;
  progress: AgentProgress | null;
  /** Turno só com clarify (awaitingKind qualify) — sem mini-card. */
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

  const running = slotActive && !progress.finished && !progress.canceled;
  if (running) return true;

  if (
    progress.awaitingKind === "plan_approval" &&
    (progress.pendingPlan?.steps?.length ?? 0) > 0
  ) {
    return true;
  }

  const edited = lastEditedFile(progress);

  if (edited && (running || !progress.finished)) return true;
  if (hasActiveShellTool(progress) && running) return true;

  if (progress.finished && progress.lastFinishOk !== false) {
    if ((progress.diffs?.length ?? 0) > 0 || (progress.deliveryFiles?.length ?? 0) > 0) {
      return true;
    }
    if (edited) return true;
  }

  // Mini-card permanente: job materializado no DB mantém o card após terminar.
  if (progress.finished && opts.isAgentJobMessage && progress.conversational !== true) {
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
    /** Chat plan-teaser: força mini-card "Plan ready" mesmo sem live awaitingKind. */
    forcePlanReady?: boolean;
  },
): AgentRunView {
  const running = isRunEffectivelyActive(progress, opts?.running);
  const jobPlan = opts?.jobPlan ?? progress.pendingPlan;
  const forgeTimeline = buildForgeTimeline(progress.timeline, running);

  const planTeaser =
    !!opts?.forcePlanReady || progress.awaitingKind === "plan_approval";
  const tasks = jobPlan?.steps?.length
    ? deriveTasksFromPlan(jobPlan, progress, { planTeaser })
    : [];

  const currentTaskIndex = Math.max(
    0,
    tasks.findIndex((t) => t.status === "active"),
  );

  const status = deriveMiniCardStatus(progress, running);
  const editedFile = lastEditedFile(progress);
  const sessionTitle = deriveSessionTitle(progress, jobPlan, opts?.userPrompt);
  const liveBriefings = collectMiniCardBriefings(progress, forgeTimeline, tasks, running, {
    userPrompt: opts?.userPrompt,
    sessionTitle,
  });

  const thoughtItems = forgeTimeline.filter((i) => i.type === "THOUGHT");
  const lastThought = thoughtItems[thoughtItems.length - 1];

  let reasoningThought: ReasoningThought | null = null;
  if (lastThought?.type === "THOUGHT") {
    reasoningThought = {
      active: !!lastThought.active,
      durationMs: lastThought.durationMs,
    };
  }

  const runStartedAtMs = opts?.runStartedAtMs;
  const latencyThinking = resolveLatencyThinking(progress, running, runStartedAtMs, forgeTimeline);

  const thinking: AgentRunView["thinking"] = reasoningThought
    ? {
        active: reasoningThought.active,
        durationMs: reasoningThought.durationMs,
        text: lastThought?.type === "THOUGHT" ? lastThought.text : undefined,
      }
    : latencyThinking
      ? { active: true, durationMs: Math.max(500, Date.now() - latencyThinking.startedAtMs) }
      : null;

  const streamBody = progress.streamText?.trim() || null;
  const narrationBody = progress.narrationText?.trim() || null;
  const summaryBody = progress.summary?.trim();
  const safeSummary = summaryBody && !isWrapUpPhrase(summaryBody) ? summaryBody : null;
  const narrationDuplicatesStream =
    !!streamBody &&
    !!narrationBody &&
    (narrationBody === streamBody ||
      streamBody.includes(narrationBody) ||
      narrationBody.includes(streamBody));
  const closingText =
    streamBody ||
    (!running && !narrationDuplicatesStream ? narrationBody || safeSummary : null) ||
    null;
  const narrationForLine =
    narrationBody &&
    narrationBody !== sessionTitle &&
    !narrationDuplicatesStream
      ? narrationBody
      : null;

  const planReady =
    !!opts?.forcePlanReady ||
    (!!jobPlan?.steps?.length &&
      (progress.awaitingKind === "plan_approval" ||
        (progress.pendingPlan?.steps?.length ?? 0) > 0));
  const { header, subtitle } = buildMiniCardHeader(progress, running, {
    editedFile,
    liveBriefings,
    sessionTitle,
    planReady,
    planHeadline: jobPlan ? planHeadlineFromPlan(jobPlan) : undefined,
  });

  return {
    runId,
    miniCard: {
      title: sessionTitle,
      header,
      subtitle,
      liveBriefings,
      status,
      tasks,
      currentTaskIndex: currentTaskIndex >= 0 ? currentTaskIndex : 0,
      editedFile,
      fileCount: progress.diffs.length || progress.deliveryFiles?.length,
      hasPlan: !!jobPlan?.steps?.length,
      planReady,
    },
    thinking,
    latencyThinking,
    reasoningThought,
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
