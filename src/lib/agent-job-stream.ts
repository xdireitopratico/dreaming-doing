import type { AgentProgress, SSEEvent } from "@/lib/agent-progress";
import { getLanguageFromPath } from "@/components/editor/fileIcons";
import {
  buildPhaseTaskTitle,
  describeStepExpectation,
  extractStepFilePaths,
} from "@/lib/step-intent";

export type NodeStatus = "active" | "done" | "failed";

export interface StepFileRef {
  path: string;
  langLabel: string;
  fileName: string;
}

export type JobStreamNode =
  | {
      kind: "thought";
      id: string;
      ts: number;
      status: "active" | "done";
      thoughtSec: number;
      prose: string;
    }
  | {
      kind: "task";
      id: string;
      ts: number;
      title: string;
      phase?: string;
    }
  | {
      kind: "step";
      id: string;
      ts: number;
      expectation: string;
      files: StepFileRef[];
      status: NodeStatus;
      technicalLabel: string;
    }
  | {
      kind: "result";
      id: string;
      ts: number;
      summary: string;
      evidence: string[];
      status: "done" | "failed";
    }
  | {
      kind: "diff";
      id: string;
      ts: number;
      path: string;
      op: "write" | "edit";
      beforeLength: number;
      afterLength: number;
      status: "done";
    };

export type CardStatus = "working" | "done" | "failed" | "idle";

export type CardView = {
  cardStatus: CardStatus;
  headerBadge: "working" | "done" | "failed" | null;
  editedFile: string | null;
  title: string;
  activeNode: JobStreamNode | null;
};

export type InspectorView = {
  nodes: JobStreamNode[];
  thoughts: { id: string; thoughtSec: number; lines: string[] }[];
  errors: JobStreamNode[];
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function truncateMomentum(text: string, max = 72): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function toFileRefs(paths: string[]): StepFileRef[] {
  return paths.map((path) => ({
    path,
    langLabel: getLanguageFromPath(path).toUpperCase(),
    fileName: fileBase(path),
  }));
}

function pathFromArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  return String(args.path ?? args.filePath ?? args.file ?? "");
}

function isRealLlmThinking(data: Record<string, unknown>): boolean {
  return data.thinking === true;
}

function isNarration(data: Record<string, unknown>): boolean {
  return data.narration === true;
}

/** Colapsa artefato legado de streaming (1 token por linha). */
export function normalizeThoughtProse(prose: string): string {
  const lines = prose.split("\n");
  if (lines.length <= 1) return prose.trim();
  const allShort = lines.every((l) => l.trim().length <= 24);
  if (allShort && lines.length >= 3) {
    return lines.map((l) => l.trim()).join(" ").replace(/\s{2,}/g, " ").trim();
  }
  return prose.trim();
}

function pushThought(nodes: JobStreamNode[], text: string, ts: number): void {
  if (!text) return;
  const last = nodes[nodes.length - 1];
  if (last?.kind === "thought" && last.status === "active") {
    last.prose = (last.prose ?? "") + text;
    last.thoughtSec = Math.max(1, Math.round((ts - last.ts) / 1000));
    return;
  }
  const seed = text.trim();
  if (!seed) return;
  nodes.push({
    kind: "thought",
    id: `thought-${ts}`,
    ts,
    status: "active",
    thoughtSec: 1,
    prose: text,
  });
}

function flushThought(nodes: JobStreamNode[], endTs: number): void {
  const last = nodes[nodes.length - 1];
  if (last?.kind === "thought" && last.status === "active") {
    last.status = "done";
    last.thoughtSec = Math.max(1, Math.round((endTs - last.ts) / 1000));
  }
}

function pushTask(
  nodes: JobStreamNode[],
  title: string,
  ts: number,
  phase?: string,
): void {
  const trimmed = title.trim();
  if (!trimmed) return;
  const last = nodes[nodes.length - 1];
  if (last?.kind === "task" && last.title === trimmed) return;
  nodes.push({
    kind: "task",
    id: `task-${ts}-${nodes.length}`,
    ts,
    title: trimmed,
    phase,
  });
}

function ensureTask(nodes: JobStreamNode[], ts: number, phase?: string): void {
  const lastTask = [...nodes].reverse().find((n) => n.kind === "task");
  if (!lastTask) {
    pushTask(nodes, buildPhaseTaskTitle(phase ?? "execute"), ts, phase);
  }
}

function closeActiveStep(nodes: JobStreamNode[], ok: boolean, error?: string): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.kind === "step" && n.status === "active") {
      nodes[i] = {
        ...n,
        status: ok ? "done" : "failed",
        ...(error ? { technicalLabel: `${n.technicalLabel} · ${error.slice(0, 80)}` } : {}),
      };
      return;
    }
  }
}

function technicalLabel(name: string, args: Record<string, unknown>): string {
  const path = pathFromArgs(args);
  if (path) return `${name} ${fileBase(path)}`;
  return name;
}

export function buildJobStreamTree(
  timeline: SSEEvent[],
  opts?: { running?: boolean },
): JobStreamNode[] {
  const nodes: JobStreamNode[] = [];
  const running = opts?.running ?? false;
  let lastResultTs = 0;

  for (const ev of timeline) {
    const ts = ev.timestamp ?? Date.now();
    const data = ev.data ?? {};

    if (ev.type === "assistant_text" && typeof data.text === "string") {
      if (isNarration(data)) continue;
      if (isRealLlmThinking(data)) {
        pushThought(nodes, String(data.text), ts);
      }
      continue;
    }

    if (
      ev.type === "phase" ||
      ev.type === "memory" ||
      ev.type === "classify" ||
      ev.type === "skills" ||
      ev.type === "explore"
    ) {
      flushThought(nodes, ts);
      const phase = typeof data.phase === "string" ? data.phase : ev.type;
      const title =
        (data.task_title as string) ??
        buildPhaseTaskTitle(
          phase,
          (data.message as string) ?? undefined,
        );
      pushTask(nodes, title, ts, phase);
      continue;
    }

    if (nodes.length && nodes[nodes.length - 1]?.kind === "thought") {
      flushThought(nodes, ts);
    }

    if (ev.type === "tool_start") {
      const name = String(data.name ?? "tool");
      const args = (data.args as Record<string, unknown> | undefined) ?? {};
      const phase = typeof data.task_phase === "string" ? data.task_phase : undefined;
      ensureTask(nodes, ts, phase);

      const rawPaths = Array.isArray(data.file_paths)
        ? (data.file_paths as string[])
        : extractStepFilePaths(name, args);
      const expectation =
        (data.step_intent as string) ?? describeStepExpectation(name, args);

      nodes.push({
        kind: "step",
        id: `step-${ts}-${nodes.length}`,
        ts,
        expectation,
        files: toFileRefs(rawPaths),
        status: "active",
        technicalLabel: technicalLabel(name, args),
      });
      continue;
    }

    if (ev.type === "file_diff") {
      const path = String(data.path ?? "unknown");
      const before = String(data.before ?? "");
      const after = String(data.after ?? "");
      const op = (data.op as "write" | "edit") ?? "write";
      nodes.push({
        kind: "diff",
        id: `diff-${ts}-${nodes.length}`,
        ts,
        path,
        op,
        beforeLength: before.length,
        afterLength: after.length,
        status: "done",
      });
      continue;
    }

    if (ev.type === "tool_done") {
      const ok = data.ok === true;
      const err = typeof data.error === "string" ? data.error : undefined;
      closeActiveStep(nodes, ok, err);
      continue;
    }

    if (ev.type === "step_result") {
      const summary = String(data.summary ?? "Resultado");
      const evidence = Array.isArray(data.evidence)
        ? (data.evidence as string[])
        : [];
      const ok = data.ok !== false;
      nodes.push({
        kind: "result",
        id: `result-${ts}`,
        ts,
        summary,
        evidence,
        status: ok ? "done" : "failed",
      });
      lastResultTs = ts;
      continue;
    }

    if (ev.type === "validate_ok") {
      if (lastResultTs > 0 && ts - lastResultTs < 50) continue;
      nodes.push({
        kind: "result",
        id: `result-${ts}`,
        ts,
        summary: "Build passou",
        evidence: ["Compilação OK", "Preview pronto para abrir"],
        status: "done",
      });
      lastResultTs = ts;
      continue;
    }

    if (ev.type === "validate_fail") {
      if (lastResultTs > 0 && ts - lastResultTs < 50) continue;
      const feedback =
        typeof data.feedback === "string"
          ? data.feedback.slice(0, 120)
          : typeof data.message === "string"
            ? data.message.slice(0, 120)
            : "Erro de compilação";
      nodes.push({
        kind: "result",
        id: `result-${ts}`,
        ts,
        summary: "Build falhou — corrigindo antes de entregar",
        evidence: [feedback],
        status: "failed",
      });
      lastResultTs = ts;
      continue;
    }

    if (ev.type === "delivery_checkpoint") {
      const files = Array.isArray(data.deliveryFiles)
        ? (data.deliveryFiles as string[])
        : [];
      nodes.push({
        kind: "result",
        id: `result-${ts}`,
        ts,
        summary: files.length
          ? `Checkpoint · ${files.length} arquivo(s)`
          : "Checkpoint salvo",
        evidence: files.map(fileBase),
        status: "done",
      });
      continue;
    }

    if (ev.type === "delivery_checkpoint_silent" || ev.type === "checkpoint_resume") {
      pushTask(nodes, buildPhaseTaskTitle("resume"), ts, "resume");
      continue;
    }

    if (ev.type === "error") {
      nodes.push({
        kind: "result",
        id: `error-${ts}`,
        ts,
        summary:
          typeof data.message === "string"
            ? data.message.slice(0, 120)
            : "Erro na execução",
        evidence: [],
        status: "failed",
      });
    }
  }

  if (running) {
    const last = nodes[nodes.length - 1];
    if (last?.kind === "thought" && last.status === "active") {
      last.thoughtSec = Math.max(1, Math.round((Date.now() - last.ts) / 1000));
    }
  } else {
    flushThought(nodes, Date.now());
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.kind === "step" && n.status === "active") {
        nodes[i] = { ...n, status: "done" };
      }
      if (n.kind === "thought") {
        nodes[i] = { ...n, prose: normalizeThoughtProse(n.prose) };
      }
    }
  }

  return nodes;
}

/** @deprecated Use buildJobStreamTree */
export const buildJobStream = buildJobStreamTree;

export function lastEditedFileFromNodes(nodes: JobStreamNode[]): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.kind === "step" && n.status === "done" && n.files[0]) {
      return n.files[0].fileName;
    }
  }
  return null;
}

function findActiveNode(nodes: JobStreamNode[]): JobStreamNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.kind === "step" && n.status === "active") return n;
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.kind === "thought" && n.status === "active") return n;
  }
  const lastStep = [...nodes].reverse().find((n) => n.kind === "step");
  if (lastStep) return lastStep;
  const lastThought = [...nodes].reverse().find((n) => n.kind === "thought");
  return lastThought ?? null;
}

function deriveMomentumTitle(
  nodes: JobStreamNode[],
  progress: Pick<AgentProgress, "message" | "statusHint" | "phase">,
  cardStatus: CardStatus,
  editedFile: string | null,
): string {
  const active = findActiveNode(nodes);

  if (active?.kind === "thought") {
    const line = active.prose.split("\n").filter(Boolean).pop() ?? "";
    return truncateMomentum(line) || "Pensando…";
  }
  if (active?.kind === "step") {
    return active.expectation;
  }

  if (cardStatus === "done") {
    const lastStep = [...nodes].reverse().find((n) => n.kind === "step");
    if (lastStep) return lastStep.expectation;
    const lastTask = [...nodes].reverse().find((n) => n.kind === "task");
    if (lastTask) return truncateMomentum(lastTask.title);
    if (editedFile) return `Pronto · ${editedFile}`;
  }
  if (cardStatus === "failed") {
    const lastResult = [...nodes].reverse().find((n) => n.kind === "result");
    if (lastResult?.status === "failed") return "Corrigindo build…";
    return "Falhou";
  }

  const lastStep = [...nodes].reverse().find((n) => n.kind === "step");
  if (lastStep) return lastStep.expectation;

  const lastTask = [...nodes].reverse().find((n) => n.kind === "task");
  if (lastTask) return truncateMomentum(lastTask.title);

  if (progress.message) return truncateMomentum(progress.message);
  if (progress.statusHint) return truncateMomentum(progress.statusHint);
  if (progress.phase) return truncateMomentum(progress.phase);

  return cardStatus === "working" ? "Trabalhando…" : "Aguardando…";
}

export function deriveCardView(
  nodes: JobStreamNode[],
  progress: Pick<
    AgentProgress,
    "finished" | "lastFinishOk" | "canceled" | "autoResuming" | "message" | "statusHint" | "phase"
  >,
  opts?: { running?: boolean },
): CardView {
  const running = opts?.running ?? !progress.finished;
  const last = nodes[nodes.length - 1];
  const hasFailedTerminal =
    (last?.kind === "result" && last.status === "failed") ||
    (last?.kind === "step" && last.status === "failed");
  const editedFile = lastEditedFileFromNodes(nodes);

  let cardStatus: CardStatus = "idle";
  let headerBadge: CardView["headerBadge"] = null;

  if (progress.canceled) {
    cardStatus = "failed";
    headerBadge = "failed";
  } else if (
    running ||
    progress.autoResuming ||
    nodes.some((n) => (n.kind === "step" || n.kind === "thought") && n.status === "active")
  ) {
    cardStatus = "working";
    headerBadge = "working";
  } else if (hasFailedTerminal || progress.lastFinishOk === false) {
    cardStatus = "failed";
    headerBadge = "failed";
  } else if (progress.finished && progress.lastFinishOk === true) {
    cardStatus = "done";
    headerBadge = null;
  } else if (progress.finished && nodes.length > 0) {
    cardStatus = "working";
    headerBadge = "working";
  }

  const title = deriveMomentumTitle(nodes, progress, cardStatus, editedFile);
  const activeNode = running ? findActiveNode(nodes) : null;

  return { cardStatus, headerBadge, editedFile, title, activeNode };
}

export function deriveInspectorView(nodes: JobStreamNode[]): InspectorView {
  const thoughts: InspectorView["thoughts"] = [];
  for (const n of nodes) {
    if (n.kind !== "thought") continue;
    const lines = n.prose.split("\n").filter(Boolean);
    if (!lines.length) continue;
    thoughts.push({ id: n.id, thoughtSec: n.thoughtSec, lines });
  }

  const errors = nodes.filter(
    (n) =>
      (n.kind === "result" && n.status === "failed") ||
      (n.kind === "step" && n.status === "failed"),
  );

  return { nodes, thoughts, errors };
}

export function miniVisibleNodes(nodes: JobStreamNode[]): JobStreamNode[] {
  const active = findActiveNode(nodes);
  if (!active) return [];
  if (active.kind === "thought") return [active];
  if (active.kind === "step") return [active];
  return [];
}

/** Chat: árvore completa permanece após finish (nunca esvazia como mini). */
export function chatPersistedNodes(nodes: JobStreamNode[]): JobStreamNode[] {
  return nodes;
}

/** Reidrata timeline mínima a partir de executionLog persistido no DB. */
export function timelineFromExecutionLog(lines: string[]): SSEEvent[] {
  const out: SSEEvent[] = [];
  let t = Date.now() - lines.length * 1000;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    t += 1000;
    if (/^read\b/i.test(trimmed) || /lendo/i.test(trimmed)) {
      out.push({
        type: "tool_start",
        timestamp: t,
        data: {
          name: "fs_read",
          args: { path: trimmed.replace(/^read\s+/i, "") },
          step_intent: describeStepExpectation("fs_read", {
            path: trimmed.replace(/^read\s+/i, ""),
          }),
        },
      });
      out.push({ type: "tool_done", timestamp: t + 1, data: { name: "fs_read", ok: true } });
    } else if (/^edit/i.test(trimmed) || /editou|edited/i.test(trimmed)) {
      out.push({
        type: "tool_start",
        timestamp: t,
        data: { name: "fs_edit", args: { path: trimmed } },
      });
      out.push({ type: "tool_done", timestamp: t + 1, data: { name: "fs_edit", ok: true } });
    } else {
      out.push({
        type: "assistant_text",
        timestamp: t,
        data: { text: trimmed, delta: true, thinking: true },
      });
    }
  }
  return out;
}