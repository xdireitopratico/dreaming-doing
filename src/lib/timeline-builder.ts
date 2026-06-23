import type { SSEEvent } from "@/lib/agent-progress";
import { buildForgeTimeline, toolBriefing, type ForgeTimelineItem } from "@/lib/forge-run";

export type TimelineEntryKind =
  | "thought"
  | "tool"
  | "result"
  | "phase"
  | "checkpoint"
  | "briefing"
  | "diff"
  | "closure";

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
  // Novos campos para os tipos ricos
  text?: string; // briefing (texto pro usuário) / closure (síntese)
  before?: string; // diff: conteúdo anterior
  after?: string; // diff: conteúdo novo
  op?: "write" | "edit"; // diff: tipo de operação
  canceled?: boolean; // closure cancelada
};

function tsFromId(id: string): number {
  const match = id.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function mapForgeItem(item: ForgeTimelineItem, running: boolean): TimelineEntry {
  switch (item.type) {
    case "TASK":
      return {
        id: item.id,
        kind: "phase",
        ts: tsFromId(item.id),
        label: item.label,
      };
    case "THOUGHT":
      return {
        id: item.id,
        kind: "thought",
        ts: item.startedAtMs ?? tsFromId(item.id),
        durationMs: item.durationMs,
        label: `Pensou por ${Math.max(1, Math.round(item.durationMs / 1000))}s`,
        detail: item.text,
        active: item.active,
      };
    case "TOOL": {
      const brief = toolBriefing(item.name, item.path, item.intent);
      const label = brief ? brief.replace(/…$/, "") : item.name;
      return {
        id: item.id,
        kind: "tool",
        ts: tsFromId(item.id),
        label,
        path: item.path,
        detail: item.detail,
        active: item.active ?? running,
        ok: item.ok,
      };
    }
    case "RESULT":
      if (item.evidence?.length) {
        return {
          id: item.id,
          kind: "checkpoint",
          ts: tsFromId(item.id),
          label: item.text,
          evidence: item.evidence,
          ok: item.ok,
        };
      }
      return {
        id: item.id,
        kind: "result",
        ts: tsFromId(item.id),
        label: item.text,
        ok: item.ok,
        detail: item.text,
      };
    case "BRIEFING":
      return {
        id: item.id,
        kind: "briefing",
        ts: tsFromId(item.id),
        label: item.text.slice(0, 80),
        text: item.text,
      };
    case "DIFF":
      return {
        id: item.id,
        kind: "diff",
        ts: tsFromId(item.id),
        label: item.path,
        path: item.path,
        op: item.op,
        before: item.before,
        after: item.after,
      };
    case "CLOSURE":
      return {
        id: item.id,
        kind: "closure",
        ts: tsFromId(item.id),
        label: item.canceled ? "Cancelado" : item.ok ? "Concluído" : "Encerrado",
        text: item.text,
        ok: item.ok,
        canceled: item.canceled,
      };
  }
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

/** Inspector timeline — delega a buildForgeTimeline (contrato único). */
export function buildTimeline(events: SSEEvent[], running = false): TimelineEntry[] {
  const items = buildForgeTimeline(events, running).map((item) => mapForgeItem(item, running));
  markActiveThought(items);
  return items;
}
