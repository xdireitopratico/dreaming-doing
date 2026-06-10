import type { AgentProgress, PendingPlan, PlanStep, SSEEvent } from "@/lib/agent-progress";

export type TaskStatus = "pending" | "active" | "done" | "failed";

export type ForgeTaskItem = {
  id: string;
  label: string;
  status: TaskStatus;
};

export type MiniCardStatus = "thinking" | "working" | "done" | "failed";

export type ForgeMiniCardData = {
  title: string;
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

function deriveTasksFromPlan(
  plan: PendingPlan,
  progress: AgentProgress,
): ForgeTaskItem[] {
  const current = progress.currentStep ?? 0;
  const executing = progress.phase === "execute" && !progress.finished;

  return plan.steps.slice(0, 6).map((step, idx) => {
    let status: TaskStatus = "pending";
    if (progress.finished && progress.lastFinishOk) status = "done";
    else if (executing && idx < current) status = "done";
    else if (executing && idx === current) status = "active";
    else if (progress.finished && !progress.lastFinishOk && idx === current) status = "failed";
    return { id: step.id, label: step.description, status };
  });
}

function deriveTasksFromTimeline(timeline: ForgeTimelineItem[]): ForgeTaskItem[] {
  const tasks: ForgeTaskItem[] = [];
  for (const item of timeline) {
    if (item.type !== "TASK") continue;
    if (tasks.some((t) => t.label === item.label)) continue;
    tasks.push({ id: item.id, label: item.label, status: "done" });
  }
  if (tasks.length > 0) {
    const last = tasks[tasks.length - 1]!;
    if (last.status === "done") last.status = "active";
  }
  return tasks.slice(-6);
}

function deriveMiniCardStatus(progress: AgentProgress, running: boolean): MiniCardStatus {
  if (progress.canceled || (progress.finished && progress.lastFinishOk === false)) {
    return "failed";
  }
  if (progress.finished && progress.lastFinishOk) return "done";
  if (running || progress.autoResuming) return "working";
  const lastThought = [...progress.timeline].reverse().find(
    (e) => e.type === "assistant_text" && isThinkingDelta(e.data),
  );
  if (lastThought && !progress.finished) return "thinking";
  return "working";
}

function deriveMiniCardTitle(
  progress: AgentProgress,
  tasks: ForgeTaskItem[],
  pendingPlan?: PendingPlan | null,
): string {
  if (pendingPlan?.mission) return pendingPlan.mission;
  if (pendingPlan?.summary) return pendingPlan.summary;
  const active = tasks.find((t) => t.status === "active");
  if (active) return active.label;
  if (progress.summary) return truncate(progress.summary, 80);
  if (progress.message) return truncate(progress.message, 80);
  if (progress.finished && progress.lastFinishOk) return "Concluído";
  return "Trabalhando no projeto…";
}

function lastEditedFile(progress: AgentProgress): string | null {
  for (let i = progress.diffs.length - 1; i >= 0; i--) {
    const d = progress.diffs[i];
    if (d?.path) return fileBase(d.path);
  }
  return null;
}

export function buildAgentRunView(
  runId: string,
  progress: AgentProgress,
  opts?: { running?: boolean; pendingPlan?: PendingPlan | null },
): AgentRunView {
  const running = opts?.running ?? !progress.finished;
  const pendingPlan = opts?.pendingPlan ?? progress.pendingPlan;
  const forgeTimeline = buildForgeTimeline(progress.timeline, running);

  const tasks = pendingPlan?.steps?.length
    ? deriveTasksFromPlan(pendingPlan, progress)
    : deriveTasksFromTimeline(forgeTimeline);

  const currentTaskIndex = Math.max(
    0,
    tasks.findIndex((t) => t.status === "active"),
  );

  const status = deriveMiniCardStatus(progress, running);
  const editedFile = lastEditedFile(progress);

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

  const narration = progress.narrationText?.trim() || null;
  const closingText =
    progress.streamText?.trim() ||
    progress.summary?.trim() ||
    null;

  return {
    runId,
    miniCard: {
      title: deriveMiniCardTitle(progress, tasks, pendingPlan),
      status,
      tasks,
      currentTaskIndex: currentTaskIndex >= 0 ? currentTaskIndex : 0,
      editedFile,
      fileCount: progress.diffs.length || progress.deliveryFiles?.length,
      hasPlan: !!pendingPlan,
    },
    thinking,
    narration:
      narration && narration !== closingText ? narration : null,
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