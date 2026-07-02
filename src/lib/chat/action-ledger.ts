import type { AgentProgress } from "@/lib/agent-progress";
import type { ForgeTimelineItem } from "@/lib/timeline-builder";

export type ActionLedgerInput = {
  progress: AgentProgress;
  forgeTimeline?: ForgeTimelineItem[];
  jobActive: boolean;
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/u, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function truncate(text: string, max = 72): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function pathFromToolArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const direct = String(args.path ?? args.filePath ?? args.file ?? "").trim();
  if (direct) return direct;
  const paths = args.paths;
  if (Array.isArray(paths) && typeof paths[0] === "string") {
    return paths[0].trim();
  }
  return "";
}

function lineForToolName(name: string, args?: Record<string, unknown>): string | null {
  const path = pathFromToolArgs(args);
  const file = path ? fileBase(path) : "";

  if (name === "fs_read" || name === "fs_read_many") {
    return file ? `Lendo ${file}…` : "Lendo…";
  }
  if (name === "fs_edit" || name === "fs_write") {
    return file ? `Editando ${file}…` : "Editando…";
  }
  if (name === "shell_exec") {
    const command = truncate(String(args?.command ?? ""), 48);
    return command ? `Executando ${command}…` : "Executando comando…";
  }
  return null;
}

function lineForTimelineItem(item: ForgeTimelineItem): string | null {
  switch (item.type) {
    case "READ": {
      const file = item.path ? fileBase(item.path) : "";
      return file ? `Lendo ${file}…` : "Lendo…";
    }
    case "CREATED":
    case "EDITED": {
      const file = item.path ? fileBase(item.path) : "";
      return file ? `Editando ${file}…` : "Editando…";
    }
    case "RUNNING":
      return item.command
        ? `Executando ${truncate(item.command, 48)}…`
        : "Executando comando…";
    default:
      return null;
  }
}

function isCompacting(progress: AgentProgress): boolean {
  if (progress.phase === "compact") return true;
  if (progress.contextUsage?.compacting) return true;
  for (let i = progress.timeline.length - 1; i >= 0; i--) {
    const ev = progress.timeline[i];
    if (ev?.type !== "phase") continue;
    const phase = String(ev.data?.phase ?? "");
    if (phase === "compact") return true;
    if (phase && phase !== "compact") break;
  }
  return false;
}

/** Projeta uma linha viva factual para o mini-card — última ação, não dump de tools. */
export function projectActionLedgerLine(input: ActionLedgerInput): string | null {
  const { progress, forgeTimeline = [], jobActive } = input;

  if (!jobActive) {
    if (progress.lastFinishOk === false) return "Finalizado com falha";
    const diffCount = progress.diffs.length || progress.deliveryFiles?.length || 0;
    if (diffCount > 0) return `☑ ${diffCount} arquivos alterados`;
    if (progress.finished) return "Concluído";
    return null;
  }

  const pendingTool = [...progress.tools].reverse().find((t) => t.ok === undefined);
  if (pendingTool) {
    const line = lineForToolName(pendingTool.name, pendingTool.args);
    if (line) return line;
  }

  const activeTimeline = [...forgeTimeline].reverse().find((item) => item.active === true);
  if (activeTimeline) {
    const line = lineForTimelineItem(activeTimeline);
    if (line) return line;
  }

  if (isCompacting(progress)) {
    return "Compactando contexto…";
  }

  const activeTask = (progress.tasks ?? []).find((t) => t.status === "active");
  if (activeTask?.label?.trim()) {
    return activeTask.label.trim();
  }

  return null;
}