// monacoEnhancements.ts — Provider de folding AI, minimap heat, CodeLens
// Aplica folding ranges com labels de resumo, heat map no minimap, lentes IA
import type { editor, languages, IDisposable } from "monaco-editor";
import type { BlameEntry } from "@/hooks/useAgentBlame";

let _disposables: IDisposable[] = [];

export function clearEnhancements() {
  _disposables.forEach((d) => d.dispose());
  _disposables = [];
}

/** Code folding with AI-generated summary labels */
export function registerAiFolding(monaco: typeof import("monaco-editor")) {
  const disp = monaco.languages.registerFoldingRangeProvider(
    { pattern: "**/*.{ts,tsx,js,jsx,css,html,json,md}" },
    {
      provideFoldingRanges(model) {
        const ranges: languages.FoldingRange[] = [];
        const text = model.getValue();
        const lines = text.split("\n");

        // JSX/HTML regions
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Opening JSX tag spanning multiple lines
          const openMatch = line.match(/^(\s*)<([A-Z][\w.]+|[a-z][\w-]+)/);
          if (openMatch && !line.includes("/>")) {
            const indent = openMatch[1].length;
            const tagName = openMatch[2];
            let closeLine = -1;
            for (let j = i + 1; j < lines.length; j++) {
              const closeMatch = lines[j].match(new RegExp(`^\\s{0,${indent}}</${tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
              if (closeMatch) {
                closeLine = j;
                break;
              }
            }
            if (closeLine > i + 1) {
              const previewLine = lines[i + 1]?.trim().slice(0, 60) ?? "";
              ranges.push({
                start: i + 1,
                end: closeLine + 1,
                kind: monaco.languages.FoldingRangeKind.Region,
              });
            }
          }

          // Function/block regions (mark by indent reduction)
          if (i > 0) {
            const prevIndent = (lines[i - 1].match(/^(\s*)/)?.[1].length ?? 0);
            const curIndent = (line.match(/^(\s*)/)?.[1].length ?? 0);
            // Block opened on previous line
            if (line.trim() === "{" || line.trim().endsWith("{")) {
              let closeLine = -1;
              for (let j = i + 1; j < lines.length; j++) {
                const jIndent = (lines[j].match(/^(\s*)/)?.[1].length ?? 0);
                if (jIndent === curIndent && lines[j].trim() === "}") {
                  closeLine = j;
                  break;
                }
              }
              if (closeLine > i + 1) {
                ranges.push({
                  start: i + 1,
                  end: closeLine + 1,
                  kind: monaco.languages.FoldingRangeKind.Region,
                });
              }
            }
          }
        }
        return ranges;
      },
    },
  );
  _disposables.push(disp);
}

/** Minimap heat map: highlights recently changed lines as colored dots in the minimap */
export function applyMinimapHeat(
  editor: editor.IStandaloneCodeEditor,
  monaco: typeof import("monaco-editor"),
  blameEntries: BlameEntry[],
) {
  const model = editor.getModel();
  if (!model || blameEntries.length === 0) return;

  const heatDecorations: editor.IModelDeltaDecoration[] = blameEntries.map((entry) => {
    // Calculate "heat" — more recent = more intense
    const age = Date.now() - entry.timestamp;
    const maxAge = 600_000; // 10 min
    const ratio = Math.max(0, 1 - age / maxAge);
    const a = Math.round(ratio * 8).toString(16);

    const endLine = entry.endLine ?? entry.line;

    return {
      range: new monaco.Range(entry.line, 1, endLine, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: "minimap-heat-marker",
        overviewRuler: {
          color: `#6ee7b7${a}0`,
          position: monaco.editor.OverviewRulerLane.Right,
        },
        inlineClassName: entry.tool === "fs_write" ? "heat-fs-write" : "heat-fs-edit",
        // The inline class opacity correlates with heat
      },
    };
  });

  editor.createDecorationsCollection(heatDecorations);
}

/** CodeLens provider: shows AI-generated explanations above code blocks */
export function registerAiCodeLens(monaco: typeof import("monaco-editor")) {
  const disp = monaco.languages.registerCodeLensProvider(
    { pattern: "**/*.{ts,tsx,js,jsx}" },
    {
      provideCodeLenses(model) {
        const lenses: languages.CodeLens[] = [];
        const text = model.getValue();
        const lines = text.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Function declarations
          const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
          if (fnMatch) {
            lenses.push({
              range: {
                startLineNumber: i + 1,
                startColumn: 1,
                endLineNumber: i + 1,
                endColumn: 1,
              },
              id: `fn-${fnMatch[1]}`,
              command: {
                id: "forge.showAiExplanation",
                title: "💡 AI Explain",
                tooltip: `Ask FORGE to explain \`${fnMatch[1]}\``,
              },
            });
          }

          // Component declarations
          const compMatch = line.match(/(?:export\s+)?(?:function|const)\s+([A-Z]\w+)/);
          if (compMatch) {
            lenses.push({
              range: {
                startLineNumber: i + 1,
                startColumn: 1,
                endLineNumber: i + 1,
                endColumn: 1,
              },
              id: `comp-${compMatch[1]}`,
              command: {
                id: "forge.showAiExplanation",
                title: "✨ AI Refactor",
                tooltip: `Ask FORGE to refactor \`${compMatch[1]}\``,
              },
            });
          }

          // TODO/FIXME comments
          if (line.match(/\/\/\s*(TODO|FIXME|HACK):?\s*(.+)/)) {
            lenses.push({
              range: {
                startLineNumber: i + 1,
                startColumn: 1,
                endLineNumber: i + 1,
                endColumn: 1,
              },
              id: `todo-${i}`,
              command: {
                id: "forge.implementTodo",
                title: "🤖 Implement",
                tooltip: "Ask FORGE to implement this TODO",
              },
            });
          }
        }
        return { lenses, dispose: () => {} };
      },
    },
  );
  _disposables.push(disp);
}

/** CSS for heat map decorations injected at runtime */
export const HEAT_MAP_CSS = `
.heat-fs-write {
  background: linear-gradient(90deg, rgba(110,231,183,0.08) 0%, transparent 100%);
  border-left: 2px solid rgba(110,231,183,0.4);
}
.heat-fs-edit {
  background: linear-gradient(90deg, rgba(59,130,246,0.08) 0%, transparent 100%);
  border-left: 2px solid rgba(59,130,246,0.4);
}
.minimap-heat-marker {
  width: 6px !important;
  background: var(--primary);
  opacity: 0.6;
}
`;
