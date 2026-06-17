import type { AgentProgress, PendingPlan, PlanStep, SSEEvent } from "@/lib/agent-progress";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";

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
  /** Header Lovable: «Edited App.tsx», «Running command», «Working». */
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
      startedAtMs: thoughtStart,
    });
    thoughtId = null;
    thoughtText = "";
  };

  for (const ev of timeline) {
    const data = ev.data ?? {};
    const ts = ev.timestamp;

    if (ev.type === "assistant_text") {
      if (isInspectorThought(data)) {
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

    if (ev.type === "step_result") {
      if (thoughtId) flushThought(ts);
      const ok = data.ok !== false;
      const text =
        typeof data.summary === "string"
          ? data.summary
          : ok
            ? "Concluído"
            : "Falhou";
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
      const label = typeof data.message === "string" ? data.message.trim() : "";
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
      const label =
        typeof data.message === "string"
          ? data.message.trim()
          : typeof data.error === "string"
            ? data.error.trim()
            : "";
      if (label) {
        items.push({ type: "TASK", id: `status-${ts}`, label: truncate(label, 120) });
      }
      continue;
    }

    if (ev.type === "phase" || ev.type === "memory") {
      const phase = typeof data.phase === "string" ? data.phase : undefined;
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
      continue;
    }

    if (ev.type === "step") {
      const current = typeof data.current === "number" ? data.current : 0;
      const total = typeof data.total === "number" ? data.total : 0;
      items.push({ type: "TASK", id: `step-${ts}`, label: `Passo ${current + 1}/${total}` });
      continue;
    }

    if (ev.type === "classify") {
      const model = typeof data.model === "string" ? data.model : "modelo";
      items.push({ type: "TASK", id: `classify-${ts}`, label: `Classificando com ${model}` });
      continue;
    }

    if (ev.type === "skills") {
      const active = Array.isArray(data.active) ? data.active : [];
      if (active.length > 0) {
        items.push({ type: "TASK", id: `skills-${ts}`, label: `Skills: ${active.join(", ")}` });
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
        text: `Build ${command}: ${ok ? "sucesso" : "falha"}`,
      });
      continue;
    }

    if (ev.type === "file_diff") {
      const path = typeof data.path === "string" ? data.path : "";
      const op = typeof data.op === "string" ? data.op : "edit";
      if (path) {
        const label = op === "write" ? `Criando ${fileBase(path)}` : `Editando ${fileBase(path)}`;
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
        text: `Type check: ${errors.length} erro(s)`,
      });
      continue;
    }

    if (ev.type === "fsm_transition") {
      const to = typeof data.to === "string" ? data.to : "unknown";
      items.push({ type: "TASK", id: `fsm-${ts}`, label: `Estado: ${to}` });
      continue;
    }

    if (ev.type === "plan_proposed") {
      const summary = typeof data.summary === "string" ? data.summary : "Plano proposto";
      items.push({ type: "TASK", id: `plan-${ts}`, label: truncate(summary, 120) });
      continue;
    }

    if (ev.type === "gate_decision") {
      const awaiting = data.awaiting === true;
      items.push({
        type: "TASK",
        id: `gate-${ts}`,
        label: awaiting ? "Aguardando aprovação" : "Gate decidido",
      });
      continue;
    }

    if (ev.type === "rate_limit") {
      items.push({ type: "TASK", id: `rate-${ts}`, label: "Rate limit — aguardando" });
      continue;
    }

    if (ev.type === "robin_rotate") {
      items.push({ type: "TASK", id: `robin-${ts}`, label: "ROBIN rotacionando chave" });
      continue;
    }

    if (ev.type === "connection_retry") {
      items.push({ type: "TASK", id: `retry-${ts}`, label: "Reconectando..." });
      continue;
    }

    if (ev.type === "context_pressure") {
      const message = typeof data.message === "string" ? data.message : "Contexto sob pressão";
      items.push({ type: "TASK", id: `pressure-${ts}`, label: truncate(message, 120) });
      continue;
    }

    if (ev.type === "context_compress") {
      items.push({ type: "TASK", id: `compress-${ts}`, label: "Comprimindo contexto" });
      continue;
    }

    if (ev.type === "start") {
      items.push({ type: "TASK", id: `start-${ts}`, label: "Iniciando execução" });
      continue;
    }

    if (ev.type === "resume") {
      items.push({ type: "TASK", id: `resume-${ts}`, label: "Retomando execução" });
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

export function deriveTasksFromPlan(
  plan: PendingPlan,
  progress: AgentProgress,
): ForgeTaskItem[] {
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
  if (progress.canceled || (progress.finished && progress.lastFinishOk === false)) {
    return "failed";
  }
  if (progress.finished && progress.error && progress.resumable) return "failed";
  if (progress.finished) return "done";
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
  if (/retomando automaticamente/i.test(t)) return null;
  if (/retomando execução/i.test(t)) return null;
  if (/retomando do passo/i.test(t)) return null;
  if (/conectando ao agente/i.test(t)) return null;
  if (/^iniciando[.…]*$/i.test(t)) return null;
  return truncate(t, 80);
}

function isInternalPhaseNoise(label: string, phase?: string): boolean {
  if (
    phase === "gather" ||
    phase === "classify" ||
    phase === "clarify" ||
    phase === "qualify" ||
    phase === "build"
  ) {
    return true;
  }
  const t = label.trim();
  if (!t) return true;
  if (/^executando passo \d+/i.test(t)) return true;
  if (/^passo \d+\s*\/\s*\d+/i.test(t)) return true;
  if (/retomando do passo \d+/i.test(t)) return true;
  return normalizeMiniCardBriefing(t) === null;
}

/** Último briefing factual — só durante job ativo; sem carrossel de histórico. */
export function collectMiniCardBriefings(
  progress: AgentProgress,
  timeline: ForgeTimelineItem[],
  tasks: ForgeTaskItem[],
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

  const activeTask = tasks.find((t) => t.status === "active");
  if (activeTask) {
    const line = normalizeMiniCardBriefing(activeTask.label);
    if (line) return [line];
  }

  const planAwaiting =
    progress.awaitingKind === "plan_approval" && (progress.pendingPlan?.steps?.length ?? 0) > 0;
  if (progress.phase === "plan" || planAwaiting) return ["Plano aguardando revisão…"];

  return [];
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

  const tasks = jobPlan?.steps?.length ? deriveTasksFromPlan(jobPlan, progress) : [];

  const currentTaskIndex = Math.max(
    0,
    tasks.findIndex((t) => t.status === "active"),
  );

  const status = deriveMiniCardStatus(progress, jobActive);
  const editedFile = lastEditedFile(progress);
  const sessionTitle = deriveSessionTitle(progress, jobPlan, opts?.userPrompt);
  const liveBriefings = collectMiniCardBriefings(progress, forgeTimeline, tasks, jobActive, {
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
  const latencyThinking = resolveLatencyThinking(progress, jobActive, runStartedAtMs, forgeTimeline);

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
    narrationBody &&
    narrationBody !== sessionTitle &&
    !narrationDuplicatesStream
      ? narrationBody
      : null;

  const { header, subtitle } = buildMiniCardHeader(progress, jobActive, {
    editedFile,
    liveBriefings,
    sessionTitle,
  });

  // Fase 2.2 — extrai o último TOOL executado (reverso do forgeTimeline) para
  // action chips no mini card. Ignora TOOLs ativos (active=true) — só
  // mostramos chips para tools que terminaram.
  const lastToolItem = [...forgeTimeline].reverse().find(
    (t) => t.type === "TOOL" && !t.active,
  ) as Extract<ForgeTimelineItem, { type: "TOOL" }> | undefined;
  const lastTool = lastToolItem
    ? { name: lastToolItem.name, path: lastToolItem.path, ok: true }
    : null;

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
      lastTool,
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
