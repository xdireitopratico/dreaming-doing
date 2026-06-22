import type { SSEEvent, AgentProgress } from "@/lib/agent-progress";
import { checkpointSummary, formatSkillInvocation, sanitizeRunText } from "@/lib/run-story-hygiene";

function hasFirstInspectorToken(progress: AgentProgress): boolean {
  if (progress.streamText?.trim() || progress.narrationText?.trim()) return true;
  return progress.timeline.some(
    (ev) =>
      ev.type === "assistant_text" &&
      typeof ev.data?.text === "string" &&
      String(ev.data.text).trim().length > 0,
  );
}

export type TimelineEntryKind = "thought" | "tool" | "result" | "phase" | "checkpoint";

export type TimelineEntry = {
  id: string;
  kind: TimelineEntryKind;
  ts: number;
  label: string;
  detail?: string;
  durationMs?: number;
  ok?: boolean;
  path?: string;
  emoji?: string;
  active?: boolean;
  evidence?: string[];
};

const SHELL_TOOLS = /shell|bash|exec|command|terminal|run_cmd/i;
const READ_TOOLS = /read|cat|view|load/i;
const WRITE_TOOLS = /write|edit|patch|create|update/i;

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function truncate(text: string, max = 80): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function isCodeLike(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes("\n")) return true;
  return /^(cd |grep |npm |pnpm |yarn |curl |git |sudo |export |cat )/im.test(t);
}

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

function toolLabel(name: string, path?: string): string {
  return name;
}

function toolDoneLabel(_name: string, _path?: string): string | null {
  return null;
}

function findLastToolItem(items: TimelineEntry[]): TimelineEntry | null {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.kind === "tool") return items[i]!;
  }
  return null;
}

function isRedundant(
  prev: TimelineEntry | null,
  ev: SSEEvent,
  data: Record<string, unknown>,
): boolean {
  if (!prev) return false;

  if (isPhaseNoise(prev, ev)) return true;
  if (isBuildRedundant(prev, ev)) return true;
  if (sameLabel(prev, ev, data)) return true;

  return false;
}

function isPhaseNoise(prev: TimelineEntry, ev: SSEEvent): boolean {
  if (prev.label === "Processando…" && (ev.type === "phase" || ev.type === "step_result"))
    return true;
  if (prev.kind === "phase" && ev.type === "phase") return true;
  return false;
}

function isBuildRedundant(prev: TimelineEntry, ev: SSEEvent): boolean {
  if (prev.kind === "phase" && prev.label.startsWith("Build") && ev.type === "build_log")
    return true;
  if (
    prev.kind === "phase" &&
    prev.label.startsWith("Build") &&
    ev.type === "tool_start" &&
    prev.ts === ev.timestamp
  )
    return true;
  return false;
}

function sameLabel(prev: TimelineEntry, ev: SSEEvent, data: Record<string, unknown>): boolean {
  const label = extractLabel(ev, data);
  if (!label) return false;
  return prev.label === label;
}

function extractLabel(ev: SSEEvent, data: Record<string, unknown>): string | null {
  switch (ev.type) {
    case "phase":
    case "memory":
    case "explore":
      return typeof data.message === "string" ? data.message.trim() : null;
    default:
      return null;
  }
}

function pathFromArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  return String(args.path ?? args.filePath ?? args.file ?? "");
}

const INTERNAL_PHASE_NOISE = new Set([
  "execute",
  "execute_step",
  "build",
  "observe",
  "summarize",
  "resume",
  "trabalhando no pedido…",
]);

function isInternalPhaseNoise(label: string): boolean {
  return INTERNAL_PHASE_NOISE.has(label.trim().toLowerCase()) || sanitizeRunText(label) === null;
}

export function buildTimeline(events: SSEEvent[], running = false): TimelineEntry[] {
  const items: TimelineEntry[] = [];
  let thoughtId: string | null = null;
  let thoughtStart = 0;
  let thoughtText = "";

  let lastThoughtTs = 0;
  let lastThoughtText = "";
  const hasThinkingText = events.some((ev) => ev.type === "thinking_text");

  const flushThought = (endTs: number) => {
    if (!thoughtId) return;
    const durationMs = Math.max(1000, endTs - thoughtStart);
    items.push({
      id: thoughtId,
      kind: "thought",
      ts: thoughtStart,
      durationMs,
      label: `Thought for ${Math.round(durationMs / 1000)}s`,
      detail: normalizeProse(thoughtText),
      active: false,
    });
    thoughtId = null;
    thoughtText = "";
    lastThoughtTs = 0;
    lastThoughtText = "";
  };

  for (const ev of events) {
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
      const text = typeof data.summary === "string" ? data.summary : ok ? "Ok" : "Erro";
      items.push({
        id: `result-${ts}`,
        kind: "result",
        ts,
        label: text,
        ok,
        detail: text,
      });
      continue;
    }

    if (thoughtId) flushThought(ts);

    const prev = items.at(-1) ?? null;
    if (isRedundant(prev, ev, data)) continue;

    if (ev.type === "explore") {
      const label = sanitizeRunText(data.message);
      if (label) {
        items.push({
          id: `explore-${ts}`,
          kind: "phase",
          ts,
          label: truncate(label, 120),
        });
      }
      continue;
    }

    if (ev.type === "phase" || ev.type === "memory") {
      const label = sanitizeRunText(data.message ?? data.phase);
      if (!label || isInternalPhaseNoise(label)) continue;
      const isBuild = /build|compila|verifica/i.test(label);
      items.push({
        id: `phase-${ts}`,
        kind: "phase",
        ts,
        label: truncate(label, 120),
        active: !isBuild ? undefined : true,
      });
      continue;
    }

    if (ev.type === "build_log") {
      const ok = data.ok !== false;
      items.push({
        id: `build-${ts}`,
        kind: "result",
        ts,
        label: ok ? "Build OK" : "Build ERRO",
        ok,
      });
      continue;
    }

    if (ev.type === "checkpoint_resume" || ev.type === "delivery_checkpoint_silent") {
      continue;
    }

    if (ev.type === "delivery_checkpoint") {
      const checkpoint = checkpointSummary(data);
      if (!checkpoint) continue;
      items.push({
        id: `checkpoint-${ts}`,
        kind: "checkpoint",
        ts,
        label: checkpoint.text,
        evidence: checkpoint.files.map(fileBase),
      });
      continue;
    }

    if (ev.type === "tool_start" || ev.type === "tool_call") {
      const name = String(data.name ?? data.tool ?? "tool");
      const args = (data.args ?? data.input ?? {}) as Record<string, unknown>;
      const path = pathFromArgs(args);
      items.push({
        id: `tool-${ts}`,
        kind: "tool",
        ts,
        label: toolLabel(name, path),
        path: path || undefined,
        detail: path ? undefined : JSON.stringify(args ?? {}).slice(0, 200),
        active: running,
      });
      continue;
    }

    if (ev.type === "tool_result" || ev.type === "tool_end") {
      const ok = data.ok !== false && data.error == null;
      const lastTool = findLastToolItem(items);
      if (lastTool) {
        const toolName = String(data.name ?? "tool");
        const pastLabel = toolDoneLabel(toolName, lastTool.path);
        lastTool.label = pastLabel ?? lastTool.label;
        lastTool.ok = ok;
        lastTool.active = false;
      }
      continue;
    }

    if (ev.type === "file_diff") {
      const path = typeof data.path === "string" ? data.path : "";
      if (path) {
        const lastTool = findLastToolItem(items);
        if (lastTool && lastTool.path === path) {
          continue;
        }
        items.push({
          id: `diff-${ts}`,
          kind: "phase",
          ts,
          label: fileBase(path),
        });
      }
      continue;
    }

    if (ev.type === "typecheck_fail") {
      const errors = Array.isArray(data.errors) ? data.errors : [];
      items.push({
        id: `typecheck-${ts}`,
        kind: "result",
        ts,
        label: `TS: ${errors.length} erro(s)`,
        ok: false,
      });
      continue;
    }

    if (ev.type === "error") {
      items.push({
        id: `error-${ts}`,
        kind: "result",
        ts,
        label: "Erro",
        detail: typeof data.message === "string" ? data.message.slice(0, 200) : undefined,
        ok: false,
      });
      continue;
    }

    if (ev.type === "timeout_warning" || ev.type === "stuck") {
      const label = typeof data.message === "string" ? data.message.trim() : "";
      if (label) {
        items.push({
          id: `status-${ts}`,
          kind: "phase",
          ts,
          label: truncate(label, 120),
        });
      }
      continue;
    }

    if (ev.type === "classify") {
      continue;
    }

    if (ev.type === "plan_proposed") {
      const summary = typeof data.summary === "string" ? data.summary : "Plano";
      items.push({
        id: `plan-${ts}`,
        kind: "phase",
        ts,
        label: truncate(summary, 120),
      });
      continue;
    }

    if (ev.type === "fsm_transition") {
      continue;
    }

    if (ev.type === "gate_decision") {
      items.push({
        id: `gate-${ts}`,
        kind: "phase",
        ts,
        label: data.awaiting === true ? "Aguardando" : "Decidido",
      });
      continue;
    }

    if (ev.type === "rate_limit") {
      items.push({
        id: `rate-${ts}`,
        kind: "phase",
        ts,
        label: "Rate limit",
      });
      continue;
    }

    if (ev.type === "robin_rotate") {
      items.push({
        id: `robin-${ts}`,
        kind: "phase",
        ts,
        label: "Robin rotating API key",
      });
      continue;
    }

    if (ev.type === "connection_retry") {
      items.push({
        id: `retry-${ts}`,
        kind: "phase",
        ts,
        label: "Reconectando…",
      });
      continue;
    }

    if (ev.type === "skills") {
      const label = formatSkillInvocation(data);
      if (label) {
        items.push({
          id: `skills-${ts}`,
          kind: "phase",
          ts,
          label,
        });
      }
      continue;
    }
  }

  if (thoughtId)
    flushThought(events.length > 0 ? events[events.length - 1]!.timestamp : thoughtStart);

  markActiveThought(items);
  return items;
}

function markActiveThought(items: TimelineEntry[]): void {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === "thought" && item.active !== false) {
      item.active = !item.detail;
      break;
    }
  }
}

export function resolveLatencyThinking(
  progress: AgentProgress,
  running: boolean,
  runStartedAtMs: number | null | undefined,
): { active: boolean; startedAtMs: number; durationMs?: number } | null {
  const storedMs = progress.latencyThoughtMs;
  if (storedMs != null && storedMs > 0) {
    return {
      active: false,
      startedAtMs: runStartedAtMs ?? Date.now() - storedMs,
      durationMs: storedMs,
    };
  }
  if (!runStartedAtMs) return null;

  const hasToken = hasFirstInspectorToken(progress);
  const timelineThoughts = progress.timeline.some(
    (ev) => ev.type === "thinking_text" || ev.data?.thinking === true,
  );

  if (hasToken || timelineThoughts || !running) {
    const durationMs = Math.max(500, Date.now() - runStartedAtMs);
    return { active: false, startedAtMs: runStartedAtMs, durationMs };
  }

  return { active: true, startedAtMs: runStartedAtMs };
}
