import type { AgentProgress, PendingPlan, PlanStep, SSEEvent } from "@/lib/agent-progress";
import { lifecycleLabel, resolveAgentLifecycle } from "@/lib/agent-lifecycle";
import { emitStreamingTelemetry } from "@/lib/streaming-telemetry";
import { checkpointSummary, formatSkillInvocation, sanitizeRunText } from "@/lib/run-story-hygiene";
import { isToolDoneEvent, isToolDoneOk, toolDoneName } from "@/lib/timeline-tool-events";

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
  /** Task list derivada do plano para checklist no mini-card do chat. */
  tasks?: Array<{ id: string; label: string; status: 'pending' | 'active' | 'done' | 'failed' }>;
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

export type TimelineItemType = "TASK" | "THOUGHT" | "TOOL" | "RESULT" | "BRIEFING" | "DIFF" | "CLOSURE";

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
      intent?: string;
    }
  | { type: "RESULT"; id: string; ok: boolean; text: string; evidence?: string[] }
  | { type: "BRIEFING"; id: string; text: string }
  | {
      type: "DIFF";
      id: string;
      path: string;
      op: "write" | "edit";
      before?: string;
      after?: string;
    }
  | { type: "CLOSURE"; id: string; ok: boolean; text: string; canceled?: boolean };

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
        continue;
      }
      // Briefing pro usuário durante o loop (assistant_text não-thinking, não-final, não-narration).
      // O fechamento final (final/narration) vira CLOSURE em done/finish, não aqui.
      // Narração/fala do LLM (content: não-thinking, não-final, não-delta) — VERDADE no inspector.
      // delta = fragmento de stream (vai só pro chat); final = CLOSURE em done/finish.
      if (
        ev.type === "assistant_text" &&
        !data.final &&
        !data.thinking &&
        !data.delta
      ) {
        const text = String(data.text ?? "").trim();
        if (text) {
          if (thoughtId) flushThought(ts);
          items.push({ type: "BRIEFING", id: `briefing-${ts}`, text });
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
      const stepIntent =
        typeof data.step_intent === "string" && data.step_intent.trim()
          ? data.step_intent.trim()
          : undefined;
      items.push({
        type: "TOOL",
        id: `tool-${ts}`,
        name,
        path: path || undefined,
        detail: undefined, // sem JSON hardcore — o label (toolBriefing) carrega o humano; tool_done preenche o resultado
        active: running,
        intent: stepIntent,
      });
      continue;
    }

    if (isToolDoneEvent(ev)) {
      const ok = isToolDoneOk(data);
      const toolName = toolDoneName(data);
      const doneSummary =
        typeof data.summary === "string" && data.summary.trim() ? data.summary.trim() : undefined;
      const doneOutput =
        typeof data.output === "string" && data.output.trim() ? data.output.trim() : undefined;
      const doneError =
        typeof data.error === "string" && data.error.trim() ? data.error.trim() : undefined;
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item?.type !== "TOOL") continue;
        // Detalhe: prioriza summary > output > erro. Limita tamanho.
        const detail = doneSummary ?? (ok ? doneOutput : doneError);
        items[i] = {
          ...item,
          name: toolName,
          active: false,
          ok,
          detail: item.detail ?? (detail ? truncate(detail, 400) : undefined),
        };
        break;
      }
      if (ev.type !== "tool_done") {
        const text = doneSummary ?? (ok ? "Concluído" : doneError ?? "Erro");
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
        const before = typeof data.before === "string" ? data.before : undefined;
        const after = typeof data.after === "string" ? data.after : undefined;
        items.push({
          type: "DIFF",
          id: `diff-${ts}`,
          path,
          op: op === "write" ? "write" : "edit",
          before: before && before.trim() ? before : undefined,
          after: after && after.trim() ? after : undefined,
        });
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

    // ── Simulacro: atos de design serializados (backend ↔ frontend mesma língua) ──
    if (ev.type === "gate") {
      const dim = String(data.dimension ?? "gate");
      const verdict = String(data.verdict ?? "?");
      items.push({
        type: "TASK",
        id: `gate-v-${ts}`,
        label: `⚖ ${dim} · ${verdict.toUpperCase()}`,
      });
      continue;
    }
    if (ev.type === "design_resolve") {
      const voices = Array.isArray(data.voices) ? (data.voices as string[]).join(", ") : "";
      const composite = String(data.composite ?? "");
      items.push({
        type: "BRIEFING",
        id: `resolve-${ts}`,
        text: `🎨 Paleta resolvida — vozes: ${voices} · gesto: ${truncate(composite, 140)}`,
      });
      continue;
    }
    if (ev.type === "directive") {
      const gesture = String(data.gesture ?? "");
      const brief = String(data.brief ?? "");
      items.push({
        type: "BRIEFING",
        id: `directive-${ts}`,
        text: `📋 Directive — gesto: ${truncate(gesture, 120)}${brief ? ` · ${truncate(brief, 100)}` : ""}`,
      });
      continue;
    }
    if (ev.type === "build_step") {
      const section = String(data.section ?? "?");
      const technique = String(data.technique ?? "");
      const layer = data.layer ? ` · ${String(data.layer)}` : "";
      items.push({
        type: "TASK",
        id: `build-${ts}`,
        label: `🏗 ${section} · ${technique}${layer}`,
      });
      continue;
    }
    if (ev.type === "dna_ready") {
      const sig = String(data.signature ?? "");
      items.push({
        type: "RESULT",
        id: `dna-${ts}`,
        ok: true,
        text: `🧬 DNA pronto · ${truncate(sig, 120)}`,
      });
      continue;
    }
    if (ev.type === "background_wait") {
      const eta = typeof data.etaSec === "number" ? data.etaSec : "?";
      const url = String(data.source_url ?? "");
      items.push({
        type: "TASK",
        id: `wait-${ts}`,
        label: `⏸ Aguardando extração · ${eta}s · ${truncate(url, 60)}`,
      });
      continue;
    }
    if (ev.type === "background_resume") {
      items.push({
        type: "RESULT",
        id: `resume-${ts}`,
        ok: true,
        text: "▶ Background concluído — retomando",
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
        type: "CLOSURE",
        id: `canceled-${ts}`,
        ok: false,
        canceled: true,
        text: truncate(message, 200),
      });
      continue;
    }

    if (ev.type === "finish") {
      if (thoughtId) flushThought(ts);
      const ok = data.ok !== false && !data.canceled;
      const summary = typeof data.summary === "string" && data.summary.trim()
        ? data.summary.trim()
        : ok
          ? "Trabalho concluído"
          : "Encerrado";
      items.push({
        type: "CLOSURE",
        id: `finish-${ts}`,
        ok,
        canceled: data.canceled === true,
        text: truncate(summary, 240),
      });
      continue;
    }

    if (ev.type === "done") {
      const summary = typeof data.summary === "string" && data.summary.trim()
        ? data.summary.trim()
        : undefined;
      // done sem summary: sinal operacional (tokens/cost) — não gera fechamento visual.
      if (!summary) continue;
      if (thoughtId) flushThought(ts);
      items.push({
        type: "CLOSURE",
        id: `done-${ts}`,
        ok: true,
        text: truncate(summary, 240),
      });
      continue;
    }

    // Accountability (critério 1): evento sem mapeamento vira linha factual — nada cai no vazio.
    items.push({ type: "TASK", id: `unknown-${ts}`, label: truncate(String(ev.type), 60) });
  }

  if (thoughtId) {
    const lastEventTs = timeline.at(-1)?.timestamp ?? thoughtStart;
    const staleMs = running ? Date.now() - lastEventTs : 0;
    // Marcar ativo enquanto job "running" e não muito stale. Janela generosa para testes e
    // casos de catch-up lento; prod atualiza timeline com novos eventos mantendo fresco.
    const active = running && staleMs < 60_000;
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

    if (item.type === "TOOL" && item.ok !== undefined) {
      const label = normalizeMiniCardBriefing(toolBriefing(item.name, item.path));
      if (label && !seenLabels.has(label)) {
        seenLabels.add(label);
        lines.push({
          id: item.id,
          label,
          description: item.path && item.path.length > 30 ? item.path : item.detail || undefined,
          toolName: item.name,
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
  const activity = collectMiniCardActivity(progress, forgeTimeline, jobActive);

  // Compute tasks from plan for mini-card checklist (to match Lovable images 4-9)
  const tasks = (jobPlan?.steps ?? []).map((step, index) => {
    let status: 'pending' | 'active' | 'done' | 'failed' = 'pending';
    if (progress.finished) {
      status = progress.lastFinishOk === false ? 'failed' : 'done';
    } else if (jobActive) {
      status = index === 0 ? 'active' : 'pending';
    }
    return {
      id: step.id || `plan-step-${index}`,
      label: step.description,
      status,
    };
  });

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
