import { useEffect, useState, useCallback } from "react";

export type EditorTheme = "default" | "legacy";

const STORAGE_KEY = "vibecoding-editor-theme";
const DEFAULT_THEME: EditorTheme = "default";

function readStored(): EditorTheme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "legacy" || v === "default" ? v : DEFAULT_THEME;
}

export function useEditorTheme() {
  const [theme, setTheme] = useState<EditorTheme>(DEFAULT_THEME);

  useEffect(() => {
    setTheme(readStored());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.querySelector(".editor-workspace");
    if (root instanceof HTMLElement) {
      root.dataset.theme = theme;
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
