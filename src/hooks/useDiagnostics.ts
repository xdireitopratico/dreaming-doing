// useDiagnostics.ts — Hook que converte erros de build/typecheck em Monaco markers
// Integrado com os eventos de validate_fail do agente
import { useCallback, useEffect, useRef } from "react";
import type { editor } from "monaco-editor";

export interface Diagnostic {
  filePath: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity: "error" | "warning" | "info";
  message: string;
  code?: string;
  source?: string;
}

interface DiagnosticsState {
  diagnostics: Diagnostic[];
  totalErrorCount: number;
  totalWarningCount: number;
}

let _globalState: DiagnosticsState = {
  diagnostics: [],
  totalErrorCount: 0,
  totalWarningCount: 0,
};

const _listeners = new Set<(state: DiagnosticsState) => void>();

export function getDiagnostics(): DiagnosticsState {
  return { ..._globalState };
}

export function subscribeDiagnostics(fn: (state: DiagnosticsState) => void) {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}

/** Push diagnostics from agent validation events */
export function pushDiagnostics(diags: Diagnostic[]) {
  _globalState.diagnostics = diags;
  _globalState.totalErrorCount = diags.filter((d) => d.severity === "error").length;
  _globalState.totalWarningCount = diags.filter((d) => d.severity === "warning").length;
  _listeners.forEach((fn) => fn({ ..._globalState }));
}

/** Clear all diagnostics */
export function clearDiagnostics() {
  _globalState = { diagnostics: [], totalErrorCount: 0, totalWarningCount: 0 };
  _listeners.forEach((fn) => fn({ ..._globalState }));
}

/** Parse a raw AgentEvent error payload into Diagnostics */
export function parseAgentDiagnostics(data: Record<string, unknown>): Diagnostic[] {
  const diags: Diagnostic[] = [];
  const message = (data.message as string) ?? (data.error as string) ?? "";
  if (!message) return diags;

  // Attempt to extract file:line:column from error messages like:
  //   src/App.tsx:10:5 - error TS2322: ...
  //   Error in src/main.tsx (line 12): ...
  //   build failed at src/index.css line 5
  const patterns = [
    /([\w./-]+\.\w+):(\d+):(\d+)\s*-\s*(?:error|warning|info)\s+\w+\d*:\s*(.+)/g,
    /(?:in|at)\s+([\w./-]+\.\w+)\s*(?:\(line\)*$|line\s*(\d+))/gi,
    /([\w./-]+\.\w+):(\d+)(?::(\d+))?\s*[-:]\s*(.+)/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(message)) !== null) {
      diags.push({
        filePath: match[1],
        line: parseInt(match[2], 10) || 1,
        column: match[3] ? parseInt(match[3], 10) : 1,
        message: (match[4] ?? message).trim(),
        severity: message.toLowerCase().includes("warning") ? "warning" : "error",
        source: "agent",
      });
    }
  }

  // If no structured diag found, add a project-level one
  if (diags.length === 0) {
    diags.push({
      filePath: "project",
      line: 1,
      message,
      severity: "error",
      source: "agent",
    });
  }

  return diags;
}

/**
 * React hook: applies diagnostics as Monaco markers on a specific editor instance
 */
export function useDiagnostics(
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>,
  filePath: string | null,
) {
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

  const applyDiagnostics = useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor || !filePath) return;

    const model = editor.getModel();
    if (!model) return;

    const fileDiags = _globalState.diagnostics.filter(
      (d) => d.filePath === filePath || d.filePath.endsWith("/" + filePath.split("/").pop()),
    );

    const markers: editor.IMarkerData[] = fileDiags.map((d) => ({
      severity:
        d.severity === "error"
          ? monaco.MarkerSeverity.Error
          : d.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.column ?? 1,
      endLineNumber: d.endLine ?? d.line,
      endColumn: d.endColumn ?? 100,
      source: d.source ?? "agent",
      code: d.code,
    }));

    monaco.editor.setModelMarkers(model, "forge-diagnostics", markers);
  }, [editorRef, filePath]);

  // Store monaco reference on mount
  const setMonaco = useCallback(
    (m: typeof import("monaco-editor")) => {
      monacoRef.current = m;
      applyDiagnostics();
    },
    [applyDiagnostics],
  );

  // Listen to global diagnostics changes
  useEffect(() => {
    const unsub = subscribeDiagnostics(() => {
      applyDiagnostics();
    });
    return unsub;
  }, [applyDiagnostics]);

  // Re-apply when filePath changes
  useEffect(() => {
    applyDiagnostics();
  }, [filePath, applyDiagnostics]);

  return { setMonaco, applyDiagnostics };
}
