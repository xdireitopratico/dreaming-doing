import { useEffect, useState, useCallback } from "react";

/**
 * usePrometheusEditorTheme — Tema A (Vibecoding palette) vs Tema B (legacy, atual).
 *
 * - Tema A (default): paleta dashboard FORGE (#0b0d12 + 3 tokens)
 * - Tema B (legacy): paleta azul-petróleo/creme original (--ps-*)
 *
 * Diferente do `useEditorTheme` (Vibecoding) — storage key e ciclo de vida separados.
 */

export type PrometheusEditorTheme = "default" | "legacy";

const STORAGE_KEY = "prometheus-editor-theme";
const DEFAULT_THEME: PrometheusEditorTheme = "default";
const DATA_ATTR = "data-prometheus-theme";

function readStored(): PrometheusEditorTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "legacy" || v === "default" ? v : DEFAULT_THEME;
}

export function usePrometheusEditorTheme() {
  const [theme, setTheme] = useState<PrometheusEditorTheme>(DEFAULT_THEME);

  useEffect(() => {
    setTheme(readStored());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.querySelector(".admin-agent-builder, .prometheus-studio");
    if (root instanceof HTMLElement) {
      root.dataset.prometheusTheme = theme;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage unavailable (SSR or private browsing)
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "default" ? "legacy" : "default"));
  }, []);

  return { theme, setTheme, toggle } as const;
}
