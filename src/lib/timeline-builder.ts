import type { SSEEvent, AgentProgress } from "@/lib/agent-progress";

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
    return lines.map((l) => l.trim()).join(" ").replace(/\s{2,}/g, " ").trim();
  }
  return prose.trim();
}

function toolEmoji(name: string, path?: string): string {
  if (path) {
    if (READ_TOOLS.test(name)) return "📄";
    if (WRITE_TOOLS.test(name)) return "✏️";
    return "🔧";
  }
  if (/search|grep|find|scan/i.test(name)) return "🔍";
  if (SHELL_TOOLS.test(name)) return "⚡";
  return "🔧";
}

function toolLabel(name: string, path?: string, detail?: string): string {
  if (path) {
    const file = fileBase(path);
    if (READ_TOOLS.test(name)) return `Ler ${file}`;
    if (WRITE_TOOLS.test(name)) return `Editou ${file}`;
    return `${name} ${path}`;
  }
  if (/search|grep|find|scan/i.test(name)) {
    const hint = detail ? truncate(detail, 48) : "resultados";
    return `Buscando ${hint}`;
  }
  if (SHELL_TOOLS.test(name)) return "Rodando comando";
  return name;
}

function isRedundant(prev: TimelineEntry | null, ev: SSEEvent, data: Record<string, unknown>): boolean {
  if (!prev) return false;

  if (isPhaseNoise(prev, ev)) return true;
  if (isBuildRedundant(prev, ev)) return true;
  if (sameLabel(prev, ev, data)) return true;

  return false;
}

function isPhaseNoise(prev: TimelineEntry, ev: SSEEvent): boolean {
  if (prev.label === "Processando…" && (ev.type === "phase" || ev.type === "step_result")) return true;
  if (prev.kind === "phase" && ev.type === "phase") return true;
  return false;
}

function isBuildRedundant(prev: TimelineEntry, ev: SSEEvent): boolean {
  if (prev.kind === "phase" && prev.label.startsWith("Build") && ev.type === "build_log") return true;
  if (prev.kind === "phase" && prev.label.startsWith("Build") && ev.type === "tool_start" && prev.ts === ev.timestamp) return true;
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
    case "build_log":
      return `Build: ${data.ok !== false ? "sucesso" : "falha"}`;
    case "tool_start":
    case "tool_call":
      return toolLabel(
        String(data.name ?? data.tool ?? "tool"),
        pathFromArgs((data.args ?? data.input) as Record<string, unknown>),
      );
    default:
      return null;
  }
}

function pathFromArgs(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  return String(args.path ?? args.filePath ?? args.file ?? "");
}

const INTERNAL_PHASE_NOISE = new Set([
  "execute", "execute_step", "build", "observe", "summarize", "resume",
  "Trabalhando no pedido…",
]);

function isInternalPhaseNoise(label: string): boolean {
  return INTERNAL_PHASE_NOISE.has(label.trim().toLowerCase());
}

export function buildTimeline(events: SSEEvent[], running = false): TimelineEntry[] {
  const items: TimelineEntry[] = [];
  let thoughtId: string | null = null;
  let thoughtStart = 0;
  let thoughtText = "";

  const flushThought = (endTs: number) => {
    if (!thoughtId) return;
    const durationMs = Math.max(1000, endTs - thoughtStart);
    items.push({
      id: thoughtId,
      kind: "thought",
      ts: thoughtStart,
      durationMs,
      label: `Raciocinou por ${Math.round(durationMs / 1000)}s`,
      detail: normalizeProse(thoughtText),
      active: false,
    });
    thoughtId = null;
    thoughtText = "";
  };

  for (const ev of events) {
    const data = ev.data ?? {};
    const ts = ev.timestamp;

    if (ev.type === "assistant_text" || ev.type === "thinking_text") {
      const isThought = ev.type === "thinking_text" || isInspectorThought(data);
      if (isThought) {
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
      const text = typeof data.summary === "string"
        ? data.summary
        : ok ? "Concluído" : "Falhou";
      items.push({
        id: `result-${ts}`,
        kind: "result",
        ts,
        label: ok ? `✓ ${text}` : `✗ ${text}`,
        ok,
        detail: text,
      });
      continue;
    }

    if (thoughtId) flushThought(ts);

    const prev = items.at(-1) ?? null;
    if (isRedundant(prev, ev, data)) continue;

    if (ev.type === "explore") {
      const label = typeof data.message === "string" ? data.message.trim() : "";
      if (label) {
        items.push({
          id: `explore-${ts}`,
          kind: "phase",
          ts,
          label: truncate(label, 120),
          emoji: "🔍",
        });
      }
      continue;
    }

    if (ev.type === "phase" || ev.type === "memory") {
      const label = typeof data.message === "string"
        ? data.message
        : typeof data.phase === "string"
          ? data.phase
          : "";
      if (!label || isInternalPhaseNoise(label)) continue;
      const isBuild = /build|compila|verifica/i.test(label);
      items.push({
        id: `phase-${ts}`,
        kind: "phase",
        ts,
        label: isBuild ? `🔨 ${label}` : truncate(label, 120),
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
        label: ok ? "✓ Build passou" : "✗ Build falhou",
        ok,
      });
      continue;
    }

    if (ev.type === "checkpoint_resume" || ev.type === "delivery_checkpoint_silent") {
      items.push({
        id: `cp-${ts}`,
        kind: "phase",
        ts,
        label: "Continuando…",
        emoji: "▶️",
      });
      continue;
    }

    if (ev.type === "delivery_checkpoint") {
      const files = Array.isArray(data.files) ? (data.files as string[]) : [];
      items.push({
        id: `checkpoint-${ts}`,
        kind: "checkpoint",
        ts,
        label: `📦 Checkpoint · ${files.length} arquivo(s)`,
        evidence: files.map(fileBase),
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
        emoji: toolEmoji(name, path),
        path: path || undefined,
        detail: path ? undefined : JSON.stringify(args ?? {}).slice(0, 200),
        active: running,
      });
      continue;
    }

    if (ev.type === "tool_result" || ev.type === "tool_end") {
      const ok = data.ok !== false && data.error == null;
      const text = typeof data.summary === "string"
        ? data.summary
        : ok ? "Concluído" : String(data.error ?? "Falhou");
      items.push({
        id: `result-${ts}`,
        kind: "result",
        ts,
        label: ok ? `✓ ${text}` : `✗ ${text}`,
        ok,
      });
      continue;
    }

    if (ev.type === "file_diff") {
      const path = typeof data.path === "string" ? data.path : "";
      if (path) {
        items.push({
          id: `diff-${ts}`,
          kind: "phase",
          ts,
          label: `Editando ${fileBase(path)}`,
          emoji: "✏️",
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
        label: `✗ TypeScript: ${errors.length} erro(s)`,
        ok: false,
      });
      continue;
    }

    if (ev.type === "error") {
      items.push({
        id: `error-${ts}`,
        kind: "result",
        ts,
        label: "✗ Erro na execução",
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
          emoji: "⚠️",
        });
      }
      continue;
    }

    if (ev.type === "classify") {
      const model = typeof data.model === "string" ? data.model : "modelo";
      items.push({
        id: `classify-${ts}`,
        kind: "phase",
        ts,
        label: `Classificando com ${model}`,
        emoji: "🏷️",
      });
      continue;
    }

    if (ev.type === "plan_proposed") {
      const summary = typeof data.summary === "string" ? data.summary : "Plano proposto";
      items.push({
        id: `plan-${ts}`,
        kind: "phase",
        ts,
        label: truncate(summary, 120),
        emoji: "📋",
      });
      continue;
    }

    if (ev.type === "fsm_transition") {
      const to = typeof data.to === "string" ? data.to : "unknown";
      items.push({
        id: `fsm-${ts}`,
        kind: "phase",
        ts,
        label: `Estado: ${to}`,
      });
      continue;
    }

    if (ev.type === "gate_decision") {
      items.push({
        id: `gate-${ts}`,
        kind: "phase",
        ts,
        label: data.awaiting === true ? "⏳ Aguardando aprovação" : "Gate decidido",
      });
      continue;
    }

    if (ev.type === "rate_limit") {
      items.push({
        id: `rate-${ts}`,
        kind: "phase",
        ts,
        label: "⏳ Rate limit — aguardando",
      });
      continue;
    }

    if (ev.type === "robin_rotate") {
      items.push({
        id: `robin-${ts}`,
        kind: "phase",
        ts,
        label: "🔄 Rotacionando chave API",
      });
      continue;
    }

    if (ev.type === "connection_retry") {
      items.push({
        id: `retry-${ts}`,
        kind: "phase",
        ts,
        label: "🔄 Reconectando…",
      });
      continue;
    }

    if (ev.type === "skills") {
      const active = Array.isArray(data.active) ? data.active : [];
      if (active.length > 0) {
        items.push({
          id: `skills-${ts}`,
          kind: "phase",
          ts,
          label: `Skills: ${active.join(", ")}`,
          emoji: "🧠",
        });
      }
      continue;
    }
  }

  if (thoughtId) flushThought(events.length > 0 ? events[events.length - 1]!.timestamp : thoughtStart);

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
  if (!running) {
    const elapsed = Date.now() - runStartedAtMs;
    return { active: false, startedAtMs: runStartedAtMs, durationMs: Math.max(1000, elapsed) };
  }
  return { active: true, startedAtMs: runStartedAtMs };
}
