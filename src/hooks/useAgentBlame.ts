// useAgentBlame.ts — Decorates Monaco gutter with agent/tool attribution
// Tracks which agent tool modified each line range, displays as lens widget
// Similar to GitLens but shows AI agent identity instead of git author
import { useCallback, useEffect, useRef } from "react";
import type { editor } from "monaco-editor";

export interface BlameEntry {
  line: number;
  endLine?: number;
  author: string;
  tool: string;
  timestamp: number;
  summary?: string;
}

interface BlameOpts {
  blameMap: BlameEntry[];
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
  monacoRef: React.MutableRefObject<typeof import("monaco-editor") | null>;
}

/**
 * Apply agent blame decorations to a Monaco editor instance.
 * Shows a subtle pill in the gutter after the line number indicating which
 * agent tool created/modified that line.
 */
export function useAgentBlame({ blameMap, editorRef, monacoRef }: BlameOpts) {
  const decorationsRef = useRef<string[]>([]);
  const widgetsRef = useRef<editor.IContentWidget[]>([]);

  const applyBlame = useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor || blameMap.length === 0) return;

    const model = editor.getModel();
    if (!model) return;

    // Clear old
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    widgetsRef.current.forEach((w) => editor.removeContentWidget(w));
    widgetsRef.current = [];

    const decorations: editor.IModelDeltaDecoration[] = [];
    const authorPalette: Record<string, string> = {};

    blameMap.forEach((entry, i) => {
      const colorIdx = i % 5;
      const colors = ["#6ee7b7", "#a78bfa", "#f472b6", "#38bdf8", "#fbbf24"];
      const color = (authorPalette[entry.author] ??= colors[colorIdx]);

      decorations.push({
        range: new monaco.Range(entry.line, 1, entry.endLine ?? entry.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: "agent-blame-marker",
          glyphMarginHoverMessage: {
            value: `**${entry.author}** — \`${entry.tool}\` — ${new Date(entry.timestamp).toLocaleTimeString()}${
              entry.summary ? `\n\n${entry.summary}` : ""
            }`,
          },
          overviewRuler: {
            color: color + "60",
            position: monaco.editor.OverviewRulerLane.Right,
          },
        },
      });
    });

    decorationsRef.current = editor.deltaDecorations([], decorations);
  }, [blameMap, editorRef, monacoRef]);

  // Reapply when blameMap changes
  useEffect(() => {
    applyBlame();
  }, [applyBlame]);

  return { applyBlame };
}

/**
 * Build blame entries from tool_call events in the agent timeline.
 * Each `fs_write` or `fs_edit` tool maps to lines in the target file.
 */
export function buildBlameFromTimeline(
  timeline: Array<{ type: string; data: Record<string, unknown>; timestamp: number }>,
): BlameEntry[] {
  const entries: BlameEntry[] = [];

  for (const event of timeline) {
    if (event.type !== "tool_done") continue;
    const name = event.data.name as string;
    const args = event.data.args as Record<string, unknown> | undefined;
    if (!name || !args) continue;

    if (name === "fs_write" && args.path) {
      const content = (args.content as string) ?? "";
      const lineCount = content.split("\n").length;
      entries.push({
        line: 1,
        endLine: lineCount,
        author: "FORGE Agent",
        tool: "fs_write",
        timestamp: event.timestamp,
        summary: `Created ${args.path}`,
      });
    }

    if (name === "fs_edit" && args.path) {
      entries.push({
        line: (args.line as number) ?? 1,
        endLine: ((args.line as number) ?? 1) + ((args.lines as number) ?? 1),
        author: "FORGE Agent",
        tool: "fs_edit",
        timestamp: event.timestamp,
        summary: `Edited ${args.path}`,
      });
    }
  }

  return entries;
}
