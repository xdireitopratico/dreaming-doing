import type { AgentProgress, SSEEvent } from "@/lib/agent-progress";

export type AtomKind =
  | "thought"
  | "read"
  | "edited"
  | "shell"
  | "listed"
  | "validate_ok"
  | "validate_fail"
  | "delivery"
  | "error"
  | "resume";

export type AtomStatus = "pending" | "active" | "done" | "failed";

export interface JobStreamAtom {
  id: string;
  kind: AtomKind;
  label: string;
  detail?: string;
  status: AtomStatus;
  ts: number;
  thoughtSec?: number;
}

export type CardStatus = "working" | "done" | "failed" | "idle";

export type CardTailStep = {
  id: string;
  label: string;
  status: AtomStatus;
};

export type CardView = {
  cardStatus: CardStatus;
  headerBadge: "working" | "done" | "failed" | null;
  editedFile: string | null;
  title: string;
  tailSteps: CardTailStep[];
};

export type InspectorThought = {
  id: string;
  thoughtSec: number;
  lines: string[];
};

export type InspectorView = {
  thoughts: InspectorThought[];
  log: JobStreamAtom[];
  errors: JobStreamAtom[];
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

function pushThoughtAtom(atoms: JobStreamAtom[], text: string, ts: number): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  const last = atoms[atoms.length - 1];
  if (last?.kind === "thought" && last.status === "active") {
    const lines = [...(last.detail?.split("\n") ?? []), trimmed].filter(Boolean);
    last.detail = lines.join("\n");
    last.label = `Thought for ${Math.max(1, Math.round((ts - last.ts) / 1000))}s`;
    last.thoughtSec = Math.max(1, Math.round((ts - last.ts) / 1000));
    return;
  }
  atoms.push({
    id: `thought-${ts}`,
    kind: "thought",
    label: "Thinking…",
    detail: trimmed,
    status: "active",
    ts,
    thoughtSec: 1,
  });
}

function flushThoughts(atoms: JobStreamAtom[], endTs: number): void {
  const last = atoms[atoms.length - 1];
  if (last?.kind === "thought" && last.status === "active") {
    const sec = Math.max(1, Math.round((endTs - last.ts) / 1000));
    last.status = "done";
    last.label = `Thought for ${sec}s`;
    last.thoughtSec = sec;
  }
}

function closeActiveTool(
  atoms: JobStreamAtom[],
  name: string,
  ok: boolean,
  error?: string,
): void {
  for (let i = atoms.length - 1; i >= 0; i--) {
    const a = atoms[i]!;
    if (a.status !== "active") continue;
    if (a.kind === "read" && name.startsWith("fs_read")) {
      atoms[i] = { ...a, status: ok ? "done" : "failed", detail: error ?? a.detail };
      return;
    }
    if (a.kind === "edited" && (name === "fs_write" || name === "fs_edit")) {
      atoms[i] = { ...a, status: ok ? "done" : "failed", detail: error ?? a.detail };
      return;
    }
    if (a.kind === "shell" && name === "shell_exec") {
      atoms[i] = { ...a, status: ok ? "done" : "failed", detail: error ?? a.detail };
      return;
    }
    if (a.kind === "listed" && name === "fs_list") {
      atoms[i] = { ...a, status: ok ? "done" : "failed" };
      return;
    }
  }
}

export function buildJobStream(
  timeline: SSEEvent[],
  opts?: { running?: boolean },
): JobStreamAtom[] {
  const atoms: JobStreamAtom[] = [];
  const running = opts?.running ?? false;

  for (const ev of timeline) {
    const ts = ev.timestamp ?? Date.now();
    const data = ev.data ?? {};

    if (ev.type === "assistant_text" && typeof data.text === "string") {
      pushThoughtAtom(atoms, data.text, ts);
      continue;
    }

    if (ev.type === "phase" && typeof data.message === "string") {
      pushThoughtAtom(atoms, String(data.message), ts);
      continue;
    }

    if (atoms.length && atoms[atoms.length - 1]?.kind === "thought") {
      flushThoughts(atoms, ts);
    }

    if (ev.type === "tool_start") {
      const name = String(data.name ?? "tool");
      const args = (data.args as Record<string, unknown> | undefined) ?? {};
      const path = pathFromArgs(args);

      if (name === "fs_read" || name === "fs_read_many") {
        atoms.push({
          id: `read-${ts}-${atoms.length}`,
          kind: "read",
          label: path ? `Read ${fileBase(path)}` : "Read files",
          detail: path || undefined,
          status: "active",
          ts,
        });
      } else if (name === "fs_write" || name === "fs_edit") {
        atoms.push({
          id: `edited-${ts}-${atoms.length}`,
          kind: "edited",
          label: path ? `Edited ${fileBase(path)}` : "Edited file",
          detail: path || undefined,
          status: "active",
          ts,
        });
      } else if (name === "fs_list" || name === "fs_glob") {
        atoms.push({
          id: `listed-${ts}-${atoms.length}`,
          kind: "listed",
          label: "Listed project files",
          status: "active",
          ts,
        });
      } else if (name === "shell_exec") {
        const cmd = String(args.command ?? "").slice(0, 48);
        atoms.push({
          id: `shell-${ts}-${atoms.length}`,
          kind: "shell",
          label: cmd ? `Ran ${cmd}` : "Ran command",
          detail: cmd || undefined,
          status: "active",
          ts,
        });
      } else {
        atoms.push({
          id: `tool-${ts}-${atoms.length}`,
          kind: "shell",
          label: name,
          status: "active",
          ts,
        });
      }
      continue;
    }

    if (ev.type === "tool_done") {
      const name = String(data.name ?? "");
      const ok = data.ok === true;
      const err = typeof data.error === "string" ? data.error : undefined;
      closeActiveTool(atoms, name, ok, err);
      continue;
    }

    if (ev.type === "validate_ok") {
      atoms.push({
        id: `validate-ok-${ts}`,
        kind: "validate_ok",
        label: "Build passed",
        status: "done",
        ts,
      });
      continue;
    }

    if (ev.type === "validate_fail") {
      atoms.push({
        id: `validate-fail-${ts}`,
        kind: "validate_fail",
        label: "Build failed",
        detail: typeof data.feedback === "string"
          ? data.feedback.slice(0, 200)
          : typeof data.message === "string"
            ? data.message.slice(0, 200)
            : undefined,
        status: "failed",
        ts,
      });
      continue;
    }

    if (ev.type === "delivery_checkpoint") {
      const files = Array.isArray(data.deliveryFiles) ? (data.deliveryFiles as string[]) : [];
      atoms.push({
        id: `delivery-${ts}`,
        kind: "delivery",
        label: files.length ? `Checkpoint · ${files.length} file(s)` : "Checkpoint",
        detail: files.map(fileBase).join(", ") || undefined,
        status: "done",
        ts,
      });
      continue;
    }

    if (ev.type === "delivery_checkpoint_silent" || ev.type === "checkpoint_resume") {
      atoms.push({
        id: `resume-${ts}`,
        kind: "resume",
        label: "Resuming on server…",
        status: "active",
        ts,
      });
      continue;
    }

    if (ev.type === "error") {
      atoms.push({
        id: `error-${ts}`,
        kind: "error",
        label: typeof data.message === "string" ? data.message.slice(0, 120) : "Agent error",
        status: "failed",
        ts,
      });
    }
  }

  if (running) {
    const last = atoms[atoms.length - 1];
    if (last?.kind === "thought" && last.status === "active") {
      const sec = Math.max(1, Math.round((Date.now() - last.ts) / 1000));
      last.label = `Thought for ${sec}s`;
      last.thoughtSec = sec;
    }
  } else {
    flushThoughts(atoms, Date.now());
    for (let i = 0; i < atoms.length; i++) {
      if (atoms[i]!.status === "active") {
        atoms[i] = { ...atoms[i]!, status: "done" };
      }
    }
  }

  return atoms;
}

export function lastEditedFileFromAtoms(atoms: JobStreamAtom[]): string | null {
  for (let i = atoms.length - 1; i >= 0; i--) {
    const a = atoms[i]!;
    if (a.kind === "edited" && a.status === "done" && a.detail) {
      return fileBase(a.detail);
    }
  }
  return null;
}

export function deriveCardView(
  atoms: JobStreamAtom[],
  progress: Pick<AgentProgress, "finished" | "lastFinishOk" | "canceled" | "autoResuming">,
  opts?: { running?: boolean; tailCount?: number },
): CardView {
  const running = opts?.running ?? !progress.finished;
  const tailCount = opts?.tailCount ?? 5;
  const last = atoms[atoms.length - 1];
  const hasFailedTerminal =
    last?.status === "failed" ||
    last?.kind === "validate_fail" ||
    last?.kind === "error";
  const editedFile = lastEditedFileFromAtoms(atoms);

  let cardStatus: CardStatus = "idle";
  let headerBadge: CardView["headerBadge"] = null;

  if (progress.canceled) {
    cardStatus = "failed";
    headerBadge = "failed";
  } else if (running || progress.autoResuming || last?.status === "active") {
    cardStatus = "working";
    headerBadge = "working";
  } else if (hasFailedTerminal || progress.lastFinishOk === false) {
    cardStatus = "failed";
    headerBadge = "failed";
  } else if (progress.finished && progress.lastFinishOk === true) {
    cardStatus = "done";
    headerBadge = "done";
  } else if (progress.finished && atoms.length > 0) {
    cardStatus = "working";
    headerBadge = "working";
  }

  let title = "Working on your request";
  if (last?.status === "active") {
    title = last.label;
  } else if (editedFile) {
    title = `Edited ${editedFile}`;
  } else if (last?.kind === "validate_fail") {
    title = "Fixing build errors";
  } else if (cardStatus === "done") {
    title = "Done";
  } else if (cardStatus === "failed") {
    title = "Run failed";
  }

  const tailSteps: CardTailStep[] = atoms.slice(-tailCount).map((a) => ({
    id: a.id,
    label: a.label,
    status: a.status,
  }));

  return { cardStatus, headerBadge, editedFile, title, tailSteps };
}

export function deriveInspectorView(atoms: JobStreamAtom[]): InspectorView {
  const thoughts: InspectorThought[] = [];
  for (const a of atoms) {
    if (a.kind !== "thought") continue;
    const lines = (a.detail ?? "").split("\n").filter(Boolean);
    if (!lines.length) continue;
    thoughts.push({
      id: a.id,
      thoughtSec: a.thoughtSec ?? 1,
      lines,
    });
  }

  const log = atoms.filter((a) => a.kind !== "thought");
  const errors = atoms.filter(
    (a) => a.status === "failed" || a.kind === "validate_fail" || a.kind === "error",
  );

  return { thoughts, log, errors };
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
        data: { name: "fs_read", args: { path: trimmed.replace(/^read\s+/i, "") } },
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
      out.push({ type: "assistant_text", timestamp: t, data: { text: trimmed } });
    }
  }
  return out;
}