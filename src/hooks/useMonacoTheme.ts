// useMonacoTheme.ts — Registra o tema FORGE antes do Monaco ser usado
import { useEffect } from "react";
import { registerForgeTheme } from "@/lib/monaco-theme";

let registered = false;

export function useMonacoTheme(monaco: unknown): void {
  useEffect(() => {
    if (monaco && !registered) {
      registerForgeTheme(monaco);
      registered = true;
    }
  }, [monaco]);
}
