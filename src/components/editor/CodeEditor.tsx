// CodeEditor.tsx — Monaco Editor + Tab System
// Tema FORGE customizado, tabs com ícones por tipo, indicador de modificado
import { useCallback, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useDiagnostics } from "@/hooks/useDiagnostics";
import { useMonacoTheme } from "@/hooks/useMonacoTheme";
import { getFileIcon, getLanguageFromPath } from "./fileIcons";
import { X, Plus } from "lucide-react";

export interface Tab {
  path: string;
  content: string;
  isModified?: boolean;
}

interface CodeEditorProps {
  tabs: Tab[];
  activePath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onContentChange: (path: string, content: string) => void;
  readonly?: boolean;
}

export function CodeEditor({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
  onContentChange,
  readonly = false,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { setMonaco } = useDiagnostics(editorRef, activePath);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    useMonacoTheme(monaco);
    monaco.editor.setTheme("forge");
    setMonaco(monaco);
  }, [setMonaco]);

  const activeTab = tabs.find((t) => t.path === activePath);

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Tab Bar */}
      <div className="flex items-center h-9 bg-[var(--surface-1)] border-b border-[var(--border)] overflow-x-auto shrink-0">
        {tabs.map((tab) => {
          const icon = getFileIcon(tab.path);
          const isActive = tab.path === activePath;
          return (
            <button
              key={tab.path}
              onClick={() => onSelectTab(tab.path)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.path);
                }
              }}
              className={`group relative flex items-center gap-1.5 h-full px-3 text-[11px] min-w-[80px] max-w-[180px] border-r border-[var(--border)] transition-colors shrink-0 ${
                isActive
                  ? "bg-[var(--background)] text-[var(--foreground)] border-t-2 border-t-[var(--primary)]"
                  : "bg-[var(--surface-2)]/50 text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className="font-mono text-[9px] tracking-wider" style={{ color: icon.color }}>
                {icon.label}
              </span>
              <span className="font-mono text-[11px] truncate">
                {tab.path.split("/").pop()}
              </span>
              {tab.isModified && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
                className={`ml-auto p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-[var(--border)] transition-opacity ${
                  tab.isModified ? "opacity-100" : ""
                }`}
              >
                <X className="size-3 text-[var(--text-dim)]" />
              </button>
            </button>
          );
        })}
      </div>

      {/* Editor */}
      {activeTab ? (
        <div className="flex-1 min-h-0">
          <Editor
            key={activePath}
            theme="forge"
            language={getLanguageFromPath(activePath ?? "")}
            value={activeTab.content}
            onChange={(value) => {
              if (value !== undefined && activePath) {
                onContentChange(activePath, value);
              }
            }}
            onMount={handleMount}
            options={{
              fontSize: 13,
              fontFamily: "'Share Tech Mono', 'Fira Code', 'Consolas', monospace",
              fontLigatures: true,
              lineNumbers: "on",
              minimap: { enabled: true, scale: 1, showSlider: "mouseover" },
              scrollBeyondLastLine: false,
              wordWrap: "off",
              padding: { top: 12, bottom: 12 },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              renderWhitespace: "selection",
              bracketPairColorization: { enabled: true },
              automaticLayout: true,
              tabSize: 2,
              readOnly: readonly,
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              guides: { indentation: true, bracketPairs: true },
              overviewRulerLanes: 0,
              lineDecorationsWidth: 8,
              lineNumbersMinChars: 4,
              folding: true,
              foldingHighlight: true,
              dragAndDrop: true,
              copyWithSyntaxHighlighting: true,
              contextmenu: true,
              quickSuggestions: true,
              suggestOnTriggerCharacters: true,
              parameterHints: { enabled: true },
            }}
            loading={
              <div className="h-full grid place-items-center bg-[var(--background)]">
                <div className="flex flex-col items-center gap-3">
                  <div className="size-8 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin" />
                  <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)]">
                    LOADING EDITOR
                  </span>
                </div>
              </div>
            }
          />
        </div>
      ) : (
        <div className="flex-1 grid place-items-center">
          <div className="text-center">
            <div className="size-16 rounded-full bg-[var(--surface-2)] border border-[var(--border)] grid place-items-center mx-auto mb-4">
              <Plus className="size-6 text-[var(--text-ghost)]" />
            </div>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-ghost)]">
              ABRA UM ARQUIVO PARA EDITAR
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
