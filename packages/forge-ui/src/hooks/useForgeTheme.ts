"use client";

import { useMemo } from "react";
import { designTokens } from "../tokens";

export function useForgeTheme() {
  return useMemo(
    () => ({
      tokens: designTokens,
      colors: designTokens.colors,
      fonts: designTokens.fonts,
      shadows: designTokens.shadows,
      cssVars: {
        background: "var(--forge-color-background)",
        foreground: "var(--forge-color-foreground)",
        brand: "var(--forge-color-brand-500)",
        surface: "var(--forge-color-surface-1)",
      },
    }),
    [],
  );
}
