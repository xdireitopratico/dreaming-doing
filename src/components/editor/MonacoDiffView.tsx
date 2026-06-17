/**
 * MonacoDiffView — side-by-side diff com syntax highlight (Fase 2.1).
 *
 * Wraps `@monaco-editor/react`'s `DiffEditor` with:
 *   - language detection by file extension (ts/tsx/css/json/md/...)
 *   - FORGE theme (registered by `registerForgeTheme` in monaco-theme.ts)
 *   - split/unified toggle (Lovable-style: side-by-side default)
 *   - line numbers + minimap off (diff is short, minimap só polui)
 *   - read-only
 *
 * Reused by `InspectorChanges`. The component is self-contained — callers
 * pass `before`, `after`, and a `path` (used only to pick the language).
 *
 * The `<DiffEditor>` from `@monaco-editor/react` does the heavy lifting; this
 * wrapper just sets sane defaults so each file diff doesn't need to repeat
 * the same options.
 */
import { useCallback, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { registerForgeTheme } from "@/lib/monaco-theme";
import { getLanguageFromPath } from "./fileIcons";
import { Columns2, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

type MonacoDiffViewProps = {
  /** Path is used only to pick the language; the diff bodies come from before/after. */
  path: string;
  before: string;
  after: string;
  /** Force a language; if not provided, inferred from path extension. */
  language?: string;
  className?: string;
};

export function MonacoDiffView({ path, before, after, language, className }: MonacoDiffViewProps) {
  const [renderSideBySide, setRenderSideBySide] = useState(true);

  const handleMount = useCallback(
    (_editor: editor.IStandaloneDiffEditor, monaco: Parameters<typeof registerForgeTheme>[0]) => {
      registerForgeTheme(monaco);
      monaco.editor.setTheme("forge");
    },
    [],
  );

  const lang = language ?? getLanguageFromPath(path) ?? "plaintext";

  return (
    <div className={cn("flex flex-col h-full min-h-0 bg-[var(--bg-hover)]", className)}>
      <div className="flex items-center justify-end h-7 px-2 bg-[var(--bg-hover)] border-b border-[var(--border)] shrink-0">
        <button
          type="button"
          onClick={() => setRenderSideBySide((v) => !v)}
          className="forge-inspector-diff-mode-toggle"
          data-testid="diff-mode-toggle"
          aria-label={renderSideBySide ? "Switch to unified" : "Switch to split"}
          title={renderSideBySide ? "Unified" : "Split"}
        >
          {renderSideBySide ? (
            <>
              <Columns2 className="size-3.5" />
              <span>Split</span>
            </>
          ) : (
            <>
              <Rows3 className="size-3.5" />
              <span>Unified</span>
            </>
          )}
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <DiffEditor
          original={before}
          modified={after}
          language={lang}
          theme="forge"
          beforeMount={(monaco) => {
            registerForgeTheme(monaco);
            monaco.editor.setTheme("forge");
          }}
          onMount={handleMount}
          options={{
            fontSize: 12,
            fontFamily: "'Share Tech Mono', 'Fira Code', 'Consolas', monospace",
            fontLigatures: true,
            renderSideBySide,
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            originalEditable: false,
            renderIndicators: true,
            renderMarginRevertIcon: false,
            renderOverviewRuler: false,
            overviewRulerLanes: 0,
            lineNumbers: "on",
            lineNumbersMinChars: 3,
            folding: false,
            guides: { indentation: false, bracketPairs: false },
            contextmenu: false,
            occurrencesHighlight: "off",
            selectionHighlight: false,
            renderLineHighlight: "none",
            automaticLayout: true,
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              verticalScrollbarSize: 6,
              horizontalScrollbarSize: 6,
              alwaysConsumeMouseWheel: false,
            },
            diffWordWrap: "off",
          }}
        />
      </div>
    </div>
  );
}
