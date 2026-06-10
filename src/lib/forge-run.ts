import type { AgentProgress, PendingPlan, PlanStep, SSEEvent } from "@/lib/agent-progress";
import { buildAgentNarrative } from "@/lib/agent-narrative";

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

/** Timer imediato ao enviar mensagem — mitiga latência antes do 1º token. */
export type LatencyThinking = {
  active: boolean;
  startedAtMs: number;
};

/** Raciocínio interno (thinking:true SSE) — «Thought for Xs» no chat. */
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
    return lines.map((l) => l.trim()).join(" ").replace(/\s{2,}/g, " ").trim();
  }
  return prose.trim();
}

export function buildForgeTimeline(
  timeline: SSEEvent[],
  running = false,
): ForgeTimelineItem[] {
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
      if (isNarration(data)) continue;
      if (isInspectorThought(data)) {
        const chunk = String(data.text ?? "");
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

    if (ev.type === "phase" || ev.type === "memory") {
      const label =
        typeof data.message === "string"
          ? data.message
          : typeof data.phase === "string"
            ? data.phase
            : "Task";
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
        text:
          typeof data.message === "string"
            ? data.message.slice(0, 200)
            : "Erro na execução",
      });
    }
  }

  if (thoughtId) {
    const endTs = running ? Date.now() : timeline.at(-1)?.timestamp ?? Date.now();
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
): ForgeTaskItem[] {
  if (progress.awaitingKind === "plan_approval") {
    return [];
  }
  const current = progress.currentStep ?? 0;
  const executing = progress.phase === "execute" && !progress.finished;
  const succeeded = progress.finished && progress.lastFinishOk !== false && !progress.canceled;
  const failed = progress.finished && (progress.lastFinishOk === false || !!progress.canceled);

  return enabledPlanSteps(plan.steps).slice(0, 6).map((step, idx) => {
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

function hasFirstResponseToken(progress: AgentProgress): boolean {
  return !!(progress.streamText?.trim() || progress.narrationText?.trim());
}

/** Briefing do mini card — sem contagem de arquivos nem duplicata de fase. */
export function normalizeMiniCardBriefing(line: string): string | null {
  const t = line.trim();
  if (!t) return null;
  if (/^explorando/i.test(t)) return "Explorando o projeto…";
  if (/^indexando/i.test(t)) return "Explorando o projeto…";
  if (/analisando o projeto/i.test(t)) return "Explorando o projeto…";
  if (/entendendo o que já existe/i.test(t)) return "Explorando o projeto…";
  if (/^pensando[.…]*$/i.test(t)) return "Pensando…";
  return truncate(t, 80);
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

  const activeThought = [...timeline].reverse().find(
    (i) => i.type === "THOUGHT" && i.active,
  );
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

  const narrative = buildAgentNarrative(progress, { running });
  if (narrative.headline) push(narrative.headline);
  if (narrative.subhint) push(narrative.subhint);

  if (progress.narrationText?.trim()) push(progress.narrationText);
  if (progress.message) push(progress.message);
  if (progress.statusHint && !/conectando|iniciando/i.test(progress.statusHint)) {
    push(progress.statusHint);
  }

  if (progress.phase === "gather") push("Explorando o projeto…");
  if (progress.phase === "classify") push("Avaliando o escopo…");
  if (progress.phase === "plan") push("Montando o plano…");

  if (running && opts?.sessionTitle) push(opts.sessionTitle);
  else if (running && opts?.userPrompt) push(deriveBrainstormTitle(opts.userPrompt));

  return lines.length > 0 ? lines : ["Trabalhando no projeto…"];
}

function isQualifyLikePhase(progress: AgentProgress): boolean {
  return (
    progress.awaitingKind === "qualify" ||
    progress.phase === "classify" ||
    progress.phase === "taste" ||
    progress.phase === "taste_chat"
  );
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

  if (isQualifyLikePhase(progress) || progress.awaiting) {
    return deriveBrainstormTitle(userPrompt);
  }

  if (progress.diffs.length > 0) {
    return `Entrega · ${progress.diffs.length} arquivo(s)`;
  }

  if (progress.deliveryFiles?.length) {
    return `Entrega · ${progress.deliveryFiles.length} arquivo(s)`;
  }

  if (progress.finished && userPrompt?.trim()) {
    const titled = deriveBrainstormTitle(userPrompt);
    if (titled !== "Brainstorm") return titled;
  }

  return progress.finished ? "Sessão concluída" : "Trabalhando no projeto…";
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
  return null;
}

export function isRunEffectivelyActive(
  progress: AgentProgress,
  slotActive = false,
): boolean {
  return !!slotActive && !progress.finished && !progress.canceled;
}

/** Mini card visível durante toda a run ativa — inclusive classify/gather antes de tools. */
export function shouldShowJobCard(opts: {
  runId?: string;
  progress: AgentProgress | null;
  isQualifyOnly: boolean;
  isAgentJobMessage: boolean;
  hasExecutionEvidence: boolean;
  slotActive: boolean;
  activeRunId?: string | null;
}): boolean {
  const {
    runId,
    progress,
    isQualifyOnly,
    isAgentJobMessage: isJobMsg,
    hasExecutionEvidence,
    slotActive,
    activeRunId,
  } = opts;

  if (!runId || !progress || isQualifyOnly) return false;

  if (
    progress.awaitingKind === "plan_approval" &&
    (progress.pendingPlan?.steps?.length ?? 0) > 0
  ) {
    return true;
  }

  const isAnchoredLiveRun =
    !!activeRunId &&
    runId === activeRunId &&
    !progress.finished &&
    !progress.canceled;

  return isJobMsg || hasExecutionEvidence || slotActive || isAnchoredLiveRun;
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
  const running = isRunEffectivelyActive(progress, opts?.running);
  const jobPlan = opts?.jobPlan ?? progress.pendingPlan;
  const forgeTimeline = buildForgeTimeline(progress.timeline, running);

  const tasks = jobPlan?.steps?.length
    ? deriveTasksFromPlan(jobPlan, progress)
    : [];

  const currentTaskIndex = Math.max(
    0,
    tasks.findIndex((t) => t.status === "active"),
  );

  const status = deriveMiniCardStatus(progress, running);
  const editedFile = lastEditedFile(progress);
  const sessionTitle = deriveSessionTitle(progress, jobPlan, opts?.userPrompt);
  const liveBriefings = collectMiniCardBriefings(
    progress,
    forgeTimeline,
    tasks,
    running,
    { userPrompt: opts?.userPrompt, sessionTitle },
  );

  const thoughtItems = forgeTimeline.filter((i) => i.type === "THOUGHT");
  const lastThought = thoughtItems[thoughtItems.length - 1];

  let reasoningThought: ReasoningThought | null = null;
  if (lastThought?.type === "THOUGHT") {
    reasoningThought = {
      active: !!lastThought.active,
      durationMs: lastThought.durationMs,
    };
  }

  let latencyThinking: LatencyThinking | null = null;
  const runStartedAtMs = opts?.runStartedAtMs;
  if (running && runStartedAtMs && !reasoningThought?.active) {
    const hideLatency = !!progress.streamText?.trim() || !!reasoningThought;
    if (!hideLatency) {
      latencyThinking = { active: true, startedAtMs: runStartedAtMs };
    }
  }

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
  const summaryBody = progress.summary?.trim();
  const safeSummary =
    summaryBody && !isWrapUpPhrase(summaryBody) ? summaryBody : null;
  const closingText = streamBody || (!running ? safeSummary : null) || null;

  return {
    runId,
    miniCard: {
      title: sessionTitle,
      liveBriefings,
      status,
      tasks,
      currentTaskIndex: currentTaskIndex >= 0 ? currentTaskIndex : 0,
      editedFile,
      fileCount: progress.diffs.length || progress.deliveryFiles?.length,
      hasPlan: !!jobPlan?.steps?.length,
      planReady:
        !!jobPlan?.steps?.length && progress.awaitingKind === "plan_approval",
    },
    thinking,
    latencyThinking,
    reasoningThought,
    narration: null,
    closingText,
    timeline: forgeTimeline,
    error: progress.error,
    finished: progress.finished,
    lastFinishOk: progress.lastFinishOk,
    resumable: progress.resumable,
  };
}

export type ForgePlanAction = "approve" | "reject" | "edit";

export function enabledPlanSteps(steps: PlanStep[]): PlanStep[] {
  const enabled = steps.filter((s) => s.enabled);
  return enabled.length > 0 ? enabled : steps;
}