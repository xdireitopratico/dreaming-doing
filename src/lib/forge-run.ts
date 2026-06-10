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
};

export type TimelineItemType = "TASK" | "THOUGHT" | "TOOL" | "RESULT";

export type ForgeTimelineItem =
  | { type: "TASK"; id: string; label: string }
  | { type: "THOUGHT"; id: string; durationMs: number; text: string; active?: boolean }
  | { type: "TOOL"; id: string; name: string; path?: string; detail?: string; active?: boolean }
  | { type: "RESULT"; id: string; ok: boolean; text: string; evidence?: string[] };

export type AgentRunView = {
  runId: string;
  miniCard: ForgeMiniCardData;
  thinking: { active: boolean; durationMs: number; text?: string } | null;
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

function isThinkingDelta(data: Record<string, unknown>): boolean {
  return data.delta === true || data.thinking === true;
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

    if (ev.type === "assistant_text" && isThinkingDelta(data)) {
      const chunk = String(data.text ?? "");
      if (!thoughtId) {
        thoughtId = `thought-${ts}`;
        thoughtStart = ts;
        thoughtText = chunk;
      } else {
        thoughtText += chunk;
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
  const lastThought = [...progress.timeline].reverse().find(
    (e) => e.type === "assistant_text" && isThinkingDelta(e.data),
  );
  if (lastThought && !progress.finished) return "thinking";
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

function toolBriefing(name: string, path?: string): string {
  const verb = TOOL_BRIEF_VERBS[name] ?? `Usando ${name}`;
  const file = path ? fileBase(path) : "";
  return file ? `${verb} ${file}…` : `${verb}…`;
}

/** Briefings humanos derivados da timeline — miniatura sem expansão (inspector). */
export function collectMiniCardBriefings(
  progress: AgentProgress,
  timeline: ForgeTimelineItem[],
  tasks: ForgeTaskItem[],
  running: boolean,
): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  const push = (line: string) => {
    const t = truncate(line.trim(), 80);
    if (!t || seen.has(t)) return;
    seen.add(t);
    lines.push(t);
  };

  const activeTask = tasks.find((t) => t.status === "active");
  if (activeTask) push(activeTask.label);

  const narrative = buildAgentNarrative(progress, { running });
  if (narrative.headline) push(narrative.headline);
  if (narrative.subhint) push(narrative.subhint);

  for (const item of [...timeline].reverse()) {
    if (item.type === "TOOL") push(toolBriefing(item.name, item.path));
    if (item.type === "TASK") push(item.label);
    if (item.type === "THOUGHT" && item.text && !item.active) {
      push(item.text);
    }
    if (item.type === "RESULT" && item.ok && item.text) push(item.text);
  }

  if (progress.message) push(progress.message);
  if (progress.statusHint && !/conectando|iniciando/i.test(progress.statusHint)) {
    push(progress.statusHint);
  }

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

/** Título curto da sessão ao terminar — não repetir o corpo do chat. */
export function deriveSessionTitle(
  progress: AgentProgress,
  jobPlan?: PendingPlan | null,
  userPrompt?: string | null,
): string {
  if (jobPlan?.mission?.trim()) return jobPlan.mission.trim();
  if (jobPlan?.summary?.trim()) return jobPlan.summary.trim();
  if (progress.planSummary?.trim()) return progress.planSummary.trim();

  if (isQualifyLikePhase(progress) || progress.awaiting) {
    return deriveBrainstormTitle(userPrompt);
  }

  const summary = progress.summary?.trim();
  if (summary) {
    const firstLine = summary
      .split("\n")[0]
      ?.replace(/^#+\s*/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (firstLine && firstLine.length <= 72 && !firstLine.endsWith("?")) {
      return firstLine;
    }
  }

  if (progress.deliveryFiles?.length) {
    return `Entrega · ${progress.deliveryFiles.length} arquivo(s)`;
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
  opts?: { running?: boolean; jobPlan?: PendingPlan | null; userPrompt?: string | null },
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
  const liveBriefings = collectMiniCardBriefings(
    progress,
    forgeTimeline,
    tasks,
    running,
  );
  const sessionTitle = deriveSessionTitle(progress, jobPlan, opts?.userPrompt);

  let thinking: AgentRunView["thinking"] = null;
  const activeThought = [...forgeTimeline].reverse().find((i) => i.type === "THOUGHT");
  if (activeThought?.type === "THOUGHT" && activeThought.active) {
    thinking = {
      active: true,
      durationMs: activeThought.durationMs,
      text: activeThought.text,
    };
  } else if (status === "thinking") {
    thinking = { active: true, durationMs: 1000 };
  } else if (activeThought?.type === "THOUGHT") {
    thinking = {
      active: false,
      durationMs: activeThought.durationMs,
      text: activeThought.text,
    };
  }

  const closingText =
    progress.streamText?.trim() ||
    progress.summary?.trim() ||
    null;

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
    },
    thinking,
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