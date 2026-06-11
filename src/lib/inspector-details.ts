import type { ForgeTimelineItem } from "@/lib/forge-run";

export type InspectorDetailBlock =
  | { kind: "thought"; id: string; durationMs: number; text: string; active?: boolean }
  | { kind: "action"; id: string; label: string; path?: string }
  | { kind: "code"; id: string; code: string }
  | { kind: "section"; id: string; title: string; body?: string };

const SHELL_TOOLS = /shell|bash|exec|command|terminal|run_cmd/i;
const READ_TOOLS = /read|cat|view|load/i;
const WRITE_TOOLS = /write|edit|patch|create|update/i;
const SEARCH_TOOLS = /search|grep|find|scan/i;

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

function humanizeToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function actionLabelFromTool(item: Extract<ForgeTimelineItem, { type: "TOOL" }>): string {
  const name = item.name;
  if (item.path) {
    const file = fileBase(item.path);
    if (READ_TOOLS.test(name)) return `Read ${file}`;
    if (WRITE_TOOLS.test(name)) return `Edited ${file}`;
    return `${humanizeToolName(name)} ${item.path}`;
  }
  if (SEARCH_TOOLS.test(name)) {
    const hint = item.detail ? truncate(item.detail, 48) : "matches";
    return `Searching the code for ${hint}`;
  }
  if (SHELL_TOOLS.test(name)) return "Running command";
  return humanizeToolName(name);
}

/** Converte timeline FORGE em blocos Details estilo Lovable. */
export function buildInspectorDetailBlocks(items: ForgeTimelineItem[]): InspectorDetailBlock[] {
  const blocks: InspectorDetailBlock[] = [];

  for (const item of items) {
    if (item.type === "THOUGHT") {
      blocks.push({
        kind: "thought",
        id: item.id,
        durationMs: item.durationMs,
        text: item.text,
        active: item.active,
      });
      continue;
    }

    if (item.type === "TASK") {
      blocks.push({ kind: "section", id: item.id, title: item.label });
      continue;
    }

    if (item.type === "TOOL") {
      if (SHELL_TOOLS.test(item.name) && item.detail && isCodeLike(item.detail)) {
        blocks.push({ kind: "code", id: item.id, code: item.detail.trim() });
        continue;
      }
      blocks.push({
        kind: "action",
        id: item.id,
        label: actionLabelFromTool(item),
        path: item.path,
      });
      if (item.detail && isCodeLike(item.detail) && !SHELL_TOOLS.test(item.name)) {
        blocks.push({ kind: "code", id: `${item.id}-detail`, code: item.detail.trim() });
      }
      continue;
    }

    if (item.type === "RESULT") {
      if (isCodeLike(item.text)) {
        blocks.push({ kind: "code", id: item.id, code: item.text.trim() });
      } else if (item.text.trim()) {
        blocks.push({
          kind: "section",
          id: item.id,
          title: item.ok ? "Result" : "Error",
          body: item.text.trim(),
        });
      }
    }
  }

  return blocks;
}

export function lastThoughtBlockId(blocks: InspectorDetailBlock[]): string | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i]?.kind === "thought") return blocks[i]!.id;
  }
  return null;
}
