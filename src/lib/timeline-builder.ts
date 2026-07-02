// src/lib/timeline-builder.ts — Construtor canônico da timeline do inspector (FORGE 2.2)
// Regra: apenas eventos intencionais/factuals entram. Ruído interno é descartado.
import type { SSEEvent } from "@/lib/agent-progress";
import type { PendingPlan } from "@/lib/agent-progress";
import {
  sanitizeRunText,
  checkpointSummary,
  isInternalRunEvent,
  isInternalRunText,
} from "@/lib/run-story-hygiene";
import { isToolDoneEvent, isToolDoneOk, toolDoneName } from "@/lib/timeline-tool-events";

export type TimelineItemType =
  | "THOUGHT"
  | "NOTE"
  | "READ"
  | "LISTED"
  | "CREATED"
  | "EDITED"
  | "RUNNING"
  | "SKILL"
  | "PLAN"
  | "TASK"
  | "RESULT"
  | "ALERT"
  | "DESIGN"
  | "DIFF"
  | "CLOSURE";

export type ForgeTimelineItem =
  | { type: "THOUGHT"; id: string; durationMs: number; text: string; active?: boolean }
  | { type: "NOTE"; id: string; title?: string; text: string }
  | { type: "READ"; id: string; path: string; detail?: string; active?: boolean; ok?: boolean }
  | { type: "LISTED"; id: string; path: string; detail?: string; active?: boolean; ok?: boolean }
  | { type: "CREATED"; id: string; path: string; detail?: string; active?: boolean; ok?: boolean }
  | { type: "EDITED"; id: string; path: string; detail?: string; active?: boolean; ok?: boolean }
  | { type: "RUNNING"; id: string; command: string; detail?: string; active?: boolean; ok?: boolean }
  | { type: "SKILL"; id: string; name: string; detail?: string; active?: boolean; ok?: boolean }
  | { type: "PLAN"; id: string; plan: PendingPlan }
  | { type: "TASK"; id: string; label: string; active?: boolean }
  | { type: "RESULT"; id: string; ok: boolean; text: string; evidence?: string[] }
  | { type: "ALERT"; id: string; level: "info" | "warn" | "error"; message: string; alertId?: string }
  | { type: "DESIGN"; id: string; kind: "resolve" | "dna_ready" | "directive" | "build_step"; title: string; detail?: string; references?: string[] }
  | { type: "DIFF"; id: string; path: string; op: "write" | "edit"; before?: string; after?: string; snippet?: string }
  | { type: "CLOSURE"; id: string; ok: boolean; text: string; canceled?: boolean };

function fileBase(path: string): string {
  const p = path.replace(/^\/+/u, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function pathFromArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  return String(args.path ?? args.filePath ?? args.file ?? args.url ?? "");
}

function truncate(text: string, max = 72): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
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

function readDetail(name: string, args: Record<string, unknown> | undefined): string {
  if (name === "web_fetch" || name === "web_scrape") {
    return String(args?.url ?? "");
  }
  if (name === "read_design_library") {
    return String(args?.source_url ?? args?.url ?? "");
  }
  if (name === "fs_read_many") {
    const paths = Array.isArray(args?.paths) ? args.paths : [];
    return paths.slice(0, 3).join(", ");
  }
  return "";
}

function listedDetail(name: string, args: Record<string, unknown> | undefined): string {
  if (name === "fs_list") return String(args?.path ?? "");
  if (name === "fs_glob") return String(args?.pattern ?? "");
  if (name === "fs_search") return String(args?.query ?? "");
  return "";
}

function skillNameFromTool(name: string): string {
  if (name === "design_resolve") return "Resolve design";
  if (name === "extract_design_dna") return "Extract design DNA";
  if (name === "read_design_library") return "Read design library";
  return name;
}

function pendingPlanFromPayload(source: Record<string, unknown>): PendingPlan | null {
  const nested =
    source.plan && typeof source.plan === "object"
      ? (source.plan as Record<string, unknown>)
      : source;
  const planId = typeof nested.planId === "string" ? nested.planId : null;
  const steps = Array.isArray(nested.steps) ? (nested.steps as PendingPlan["steps"]) : [];
  const runId = typeof nested.runId === "string" ? nested.runId : null;
  const projectId = typeof nested.projectId === "string" ? nested.projectId : "";
  if (!planId || !runId || !projectId || steps.length === 0) return null;
  return {
    planId,
    summary: typeof nested.summary === "string" ? nested.summary : "Plano proposto",
    rationale:
      typeof nested.rationale === "string" && nested.rationale.trim()
        ? nested.rationale.trim()
        : undefined,
    markdown:
      typeof nested.markdown === "string" && nested.markdown.trim()
        ? nested.markdown.trim()
        : undefined,
    mission: typeof nested.mission === "string" ? nested.mission : undefined,
    objective: typeof nested.objective === "string" ? nested.objective : undefined,
    steps,
    ttlMs: typeof nested.ttlMs === "number" ? nested.ttlMs : 60_000,
    proposedAt:
      typeof nested.proposedAt === "string" && nested.proposedAt
        ? Date.parse(nested.proposedAt) || Date.now()
        : Date.now(),
    runId,
    projectId,
  };
}

export function buildForgeTimeline(timeline: SSEEvent[], running = false): ForgeTimelineItem[] {
  const items: ForgeTimelineItem[] = [];
  let thoughtId: string | null = null;
  let thoughtStart = 0;
  let thoughtText = "";
  let lastThoughtTs = 0;
  let lastThoughtText = "";
  let lastPlanSig = "";
  let lastClosureSig = "";

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
    lastThoughtTs = 0;
    lastThoughtText = "";
  };

  const upsertTool = (ev: SSEEvent, active = false) => {
    const data = ev.data ?? {};
    const name = String(data.name ?? data.tool ?? "tool");
    const args = (data.args ?? data.input) as Record<string, unknown> | undefined;
    const rawPath = pathFromArgs(args);
    const path = rawPath ? fileBase(rawPath) : "";
    const ts = ev.timestamp;

    if (name === "fs_read" || name === "fs_read_many" || name === "web_fetch" || name === "web_scrape" || name === "read_design_library" || name === "web_search" || name === "web_research") {
      items.push({
        type: "READ",
        id: `read-${ts}`,
        path: path || skillNameFromTool(name),
        detail: truncate(readDetail(name, args) || rawPath),
        active,
      });
      return;
    }
    if (name === "fs_list" || name === "fs_glob" || name === "fs_search") {
      items.push({
        type: "LISTED",
        id: `listed-${ts}`,
        path: path || truncate(listedDetail(name, args)),
        detail: truncate(rawPath),
        active,
      });
      return;
    }
    if (name === "fs_write") {
      items.push({
        type: "CREATED",
        id: `created-${ts}`,
        path: path || truncate(rawPath),
        active,
      });
      return;
    }
    if (name === "fs_edit") {
      items.push({
        type: "EDITED",
        id: `edited-${ts}`,
        path: path || truncate(rawPath),
        active,
      });
      return;
    }
    if (name === "shell_exec") {
      const command = String(args?.command ?? "");
      items.push({
        type: "RUNNING",
        id: `running-${ts}`,
        command: truncate(command) || "command",
        detail: truncate(command),
        active,
      });
      return;
    }
    items.push({
      type: "SKILL",
      id: `skill-${ts}`,
      name: skillNameFromTool(name),
      detail: truncate(path || rawPath),
      active,
    });
  };

  const updateLastTool = (ok: boolean, detail?: string, name?: string) => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (
        item?.type !== "READ" &&
        item?.type !== "LISTED" &&
        item?.type !== "CREATED" &&
        item?.type !== "EDITED" &&
        item?.type !== "RUNNING" &&
        item?.type !== "SKILL"
      ) {
        continue;
      }
      if (name && item.type === "RUNNING" && item.command !== name) continue;
      items[i] = { ...item, active: false, ok, detail: detail ? truncate(detail, 400) : item.detail };
      return;
    }
  };

  for (const ev of timeline) {
    const data = ev.data ?? {};
    const ts = ev.timestamp;

    if (isInternalRunEvent(ev.type, data) && ev.type !== "phase") {
      continue;
    }

    if (ev.type === "thinking_text") {
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

    if (ev.type === "agent_note") {
      flushThought(ts);
      const text = String(data.text ?? "").trim();
      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : undefined;
      if (text) {
        items.push({ type: "NOTE", id: `note-${ts}`, title, text });
      }
      continue;
    }

    if (ev.type === "step_result") {
      flushThought(ts);
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

    flushThought(ts);

    if (ev.type === "alert") {
      const level = (data.level as "info" | "warn" | "error") ?? "info";
      const message = String(data.message ?? "").trim();
      if (message) {
        items.push({
          type: "ALERT",
          id: `alert-${ts}`,
          level,
          message,
          alertId: String(data.alertId ?? ""),
        });
      }
      continue;
    }

    if (ev.type === "design") {
      const designKind = data.kind as "resolve" | "dna_ready" | "directive" | "build_step" | undefined;
      const kind: NonNullable<typeof designKind> = designKind ?? "resolve";
      const title = String(data.title ?? "").trim();
      const detail = typeof data.detail === "string" ? data.detail.trim() : undefined;
      const references = Array.isArray(data.references)
        ? (data.references as string[]).filter((r) => typeof r === "string")
        : undefined;
      if (title) {
        items.push({ type: "DESIGN", id: `design-${ts}`, kind, title, detail, references });
      }
      continue;
    }

    if (ev.type === "tool_start" || ev.type === "tool_call") {
      upsertTool(ev, running);
      continue;
    }

    if (isToolDoneEvent(ev)) {
      const ok = isToolDoneOk(data);
      const toolName = toolDoneName(data);
      const doneSummary = typeof data.summary === "string" && data.summary.trim() ? data.summary.trim() : undefined;
      const doneOutput = typeof data.output === "string" && data.output.trim() ? data.output.trim() : undefined;
      const doneError = typeof data.error === "string" && data.error.trim() ? data.error.trim() : undefined;
      const detail = doneSummary ?? (ok ? doneOutput : doneError);
      updateLastTool(ok, detail, toolName);
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
          before: before?.trim() ? before : undefined,
          after: after?.trim() ? after : undefined,
        });
      }
      continue;
    }

    if (ev.type === "plan_proposed") {
      const plan = pendingPlanFromPayload(data);
      if (plan) {
        const sig = `${plan.planId}:${plan.summary}:${plan.steps.length}`;
        if (sig !== lastPlanSig) {
          items.push({ type: "PLAN", id: `plan-${plan.planId}-${ts}`, plan });
          lastPlanSig = sig;
        }
      } else {
        const summary = typeof data.summary === "string" ? data.summary : "Plano";
        if (summary.trim()) {
          const sig = `fallback:${summary.trim()}`;
          if (sig !== lastPlanSig) {
            items.push({ type: "TASK", id: `plan-${ts}`, label: truncate(summary, 120) });
            lastPlanSig = sig;
          }
        }
      }
      continue;
    }

    if (ev.type === "task") {
      const id = String(data.id ?? "");
      const label = typeof data.label === "string" ? data.label.trim() : "";
      if (id && label) {
        items.push({
          type: "TASK",
          id: `task-${id}-${ts}`,
          label: truncate(label, 120),
          active: data.active === true,
        });
      }
      continue;
    }

    if (ev.type === "gate_decision") {
      const awaiting = data.awaiting === true;
      items.push({
        type: "TASK",
        id: `gate-${ts}`,
        label: awaiting ? "Aguardando sua resposta" : "Decisão registrada",
      });
      continue;
    }

    if (ev.type === "step") {
      const current = typeof data.current === "number" ? data.current : null;
      const total = typeof data.total === "number" ? data.total : null;
      const stepLabel = typeof data.label === "string" ? data.label.trim() : "";
      if (current !== null && total !== null && stepLabel) {
        items.push({ type: "TASK", id: `step-${ts}`, label: stepLabel });
      }
      continue;
    }

    if (ev.type === "done" || ev.type === "finish") {
      flushThought(ts);
      const ok = data.ok !== false && !data.canceled;
      const canceled = data.canceled === true;
      const summary =
        typeof data.summary === "string" && data.summary.trim()
          ? data.summary.trim()
          : ok
            ? "Trabalho concluído"
            : canceled
              ? "Cancelado"
              : "Encerrado";
      const sig = `${ok ? "ok" : "fail"}:${canceled ? "canceled" : "open"}:${summary.trim()}`;
      if (sig === lastClosureSig) continue;
      lastClosureSig = sig;
      items.push({
        type: "CLOSURE",
        id: `closure-${ts}`,
        ok,
        text: truncate(summary, 240),
        canceled,
      });
      continue;
    }

    if (ev.type === "canceled") {
      flushThought(ts);
      const message = typeof data.message === "string" ? data.message : "Cancelado";
      items.push({
        type: "CLOSURE",
        id: `canceled-${ts}`,
        ok: false,
        text: truncate(message, 200),
        canceled: true,
      });
      continue;
    }

    if (ev.type === "error") {
      flushThought(ts);
      const text = typeof data.message === "string" ? data.message.slice(0, 200) : "Erro";
      items.push({ type: "CLOSURE", id: `error-${ts}`, ok: false, text });
      continue;
    }

    if (isInternalRunEvent(ev.type, data)) {
      continue;
    }

    // Fallback canônico para eventos não reconhecidos — nunca drop silencioso.
    flushThought(ts);
    const fallbackMessage = typeof data.message === "string" ? data.message : "";
    const fallbackSummary = typeof data.summary === "string" ? data.summary : "";
    const fallbackText = fallbackMessage || fallbackSummary || ev.type;
    const shouldRenderFallback = fallbackText.trim() && !isInternalRunText(fallbackText);
    if (shouldRenderFallback) {
      items.push({
        type: "TASK",
        id: `fallback-${ts}`,
        label: truncate(fallbackText, 120),
      });
    }
    continue;
  }

  if (thoughtId) {
    const lastEventTs = timeline.at(-1)?.timestamp ?? thoughtStart;
    const staleMs = running ? Date.now() - lastEventTs : 0;
    const active = running && staleMs < 60_000;
    const endTs = active ? Date.now() : Math.max(thoughtStart + 1000, lastEventTs);
    const durationMs = Math.max(1000, endTs - thoughtStart);
    items.push({
      type: "THOUGHT",
      id: thoughtId,
      durationMs,
      text: normalizeProse(thoughtText),
      active,
    });
  }

  return items;
}

/** Verifica se há job ativo confirmado. */
export function hasActiveJob(
  progress: { finished: boolean; canceled?: boolean; awaiting?: boolean; awaitingKind?: string | null },
  opts?: { running?: boolean; slotActive?: boolean },
): boolean {
  if (progress.finished || progress.canceled || progress.awaiting) return false;
  if (progress.awaitingKind === "plan_approval" || progress.awaitingKind === "clarify") return false;
  return !!(opts?.running && opts?.slotActive);
}

/** Briefing legível para mini-card a partir de um item da timeline canônica. */
export function timelineItemBriefing(item: ForgeTimelineItem): string | null {
  switch (item.type) {
    case "THOUGHT":
      return "Raciocinando…";
    case "NOTE":
      return truncate(item.text, 80);
    case "READ":
      return item.path ? `Read ${item.path}` : "Read";
    case "LISTED":
      return item.path ? `Listed ${item.path}` : "Listed";
    case "CREATED":
      return item.path ? `Created ${item.path}` : "Created";
    case "EDITED":
      return item.path ? `Edited ${item.path}` : "Edited";
    case "RUNNING":
      return item.command ? `Running ${item.command}` : "Running command";
    case "SKILL":
      return item.name;
    case "PLAN":
      return `${sanitizeRunText(item.plan.summary, 80)} · ${item.plan.steps.length} step(s)`;
    case "TASK":
      return sanitizeRunText(item.label, 80);
    case "RESULT":
      return sanitizeRunText(item.text, 80);
    case "ALERT":
      return sanitizeRunText(item.message, 80);
    case "DESIGN":
      return sanitizeRunText(item.title, 80);
    case "DIFF":
      return `Diff ${fileBase(item.path)}`;
    case "CLOSURE":
      return sanitizeRunText(item.text, 80);
    default:
      return null;
  }
}
