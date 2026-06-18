import {
  MOODS,
  type DesignMood,
  type MoodPalette,
} from "./moods";

/**
 * Base imutável — tudo que NÃO muda por mood (espaçamento, raio, fontes,
 * tipografia, breakpoints, z-index, sombras estruturais). A identidade visual
 * (cor + glow) vem do mood. Assim o design system é uma FUNÇÃO do contexto,
 * não uma constante.
 */
const BASE = {
  spacing: {
    0: "0", 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem",
    5: "1.25rem", 6: "1.5rem", 8: "2rem", 10: "2.5rem", 12: "3rem",
    16: "4rem", 20: "5rem", 24: "6rem",
  },
  radius: {
    none: "0", sm: "0.25rem", md: "0.375rem", lg: "0.5rem",
    xl: "0.75rem", "2xl": "1rem", full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    "glow-silver": "0 0 24px rgba(201, 206, 214, 0.18)",
  },
  fonts: {
    display: '"Space Grotesk", system-ui, sans-serif',
    body: '"Inter", system-ui, sans-serif',
    mono: '"Share Tech Mono", "Fira Code", "Consolas", monospace',
  },
  fontSizes: {
    xs: "0.75rem", sm: "0.875rem", base: "1rem", lg: "1.125rem",
    xl: "1.25rem", "2xl": "1.5rem", "3xl": "1.875rem", "4xl": "2.25rem",
    "5xl": "3rem", "6xl": "3.75rem",
  },
  transitions: { fast: "150ms ease", normal: "200ms ease", slow: "300ms ease" },
  breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
  zIndex: {
    hide: -1, base: 0, dropdown: 100, sticky: 200, overlay: 300,
    modal: 400, popover: 500, toast: 600, tooltip: 700,
  },
} as const;

export interface DesignTokens {
  colors: {
    brand: MoodPalette["brand"];
    accent: { 500: string; 600: string };
    neutral: Record<string, string>;
    surface: { 1: string; 2: string; 3: string; 4: string };
    background: string;
    foreground: string;
    border: string;
    ring: string;
  };
  spacing: typeof BASE.spacing;
  radius: typeof BASE.radius;
  shadows: typeof BASE.shadows & { glow: string };
  fonts: typeof BASE.fonts;
  fontSizes: typeof BASE.fontSizes;
  transitions: typeof BASE.transitions;
  breakpoints: typeof BASE.breakpoints;
  zIndex: typeof BASE.zIndex;
}

/** Tokens completos para um mood — cor + glow vêm da paleta, o resto é base. */
export function buildDesignTokens(mood: DesignMood = "ember"): DesignTokens {
  const p = MOODS[mood];
  return {
    colors: {
      brand: p.brand,
      accent: p.accent,
      neutral: {
        50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1",
        400: "#94A3B8", 500: "#64748B", 600: "#475569", 700: "#334155",
        800: "#1E293B", 900: "#0F172A", 950: "#020617",
      },
      surface: p.surface,
      background: p.background,
      foreground: p.foreground,
      border: `color-mix(in srgb, ${p.foreground} 8%, transparent)`,
      ring: p.ring,
    },
    spacing: BASE.spacing,
    radius: BASE.radius,
    shadows: { ...BASE.shadows, glow: p.glow },
    fonts: BASE.fonts,
    fontSizes: BASE.fontSizes,
    transitions: BASE.transitions,
    breakpoints: BASE.breakpoints,
    zIndex: BASE.zIndex,
  };
}

/** Bloco @theme (Tailwind v4) para um mood — cole em src/index.css. */
export function buildThemeBlock(mood: DesignMood = "ember"): string {
  const t = buildDesignTokens(mood);
  const p = MOODS[mood];
  const darkAttr = p.dark ? "" : '  /* mood claro */';
  return `@theme {
${darkAttr}
  --color-brand-50: ${t.colors.brand[50]};
  --color-brand-100: ${t.colors.brand[100]};
  --color-brand-200: ${t.colors.brand[200]};
  --color-brand-300: ${t.colors.brand[300]};
  --color-brand-400: ${t.colors.brand[400]};
  --color-brand-500: ${t.colors.brand[500]};
  --color-brand-600: ${t.colors.brand[600]};
  --color-brand-700: ${t.colors.brand[700]};
  --color-brand-800: ${t.colors.brand[800]};
  --color-brand-900: ${t.colors.brand[900]};
  --color-brand-500-foreground: ${p.brandForeground};
  --color-accent-500: ${t.colors.accent[500]};
  --color-accent-600: ${t.colors.accent[600]};
  --color-surface-1: ${t.colors.surface[1]};
  --color-surface-2: ${t.colors.surface[2]};
  --color-surface-3: ${t.colors.surface[3]};
  --color-surface-4: ${t.colors.surface[4]};
  --color-background: ${t.colors.background};
  --color-foreground: ${t.colors.foreground};
  --color-muted-foreground: ${p.dark ? "#94A3B8" : "#6B6256"};
  --color-border: ${t.colors.border};
  --color-destructive: #E5484D;
  --color-destructive-foreground: #FAFAFA;
  --color-success: #22C55E;
  --color-ring: ${t.colors.ring};
  --radius-sm: ${t.radius.sm};
  --radius-md: ${t.radius.md};
  --radius-lg: ${t.radius.lg};
  --radius-xl: ${t.radius.xl};
  --radius-2xl: ${t.radius["2xl"]};
  --radius-full: ${t.radius.full};
  --shadow-sm: ${t.shadows.sm};
  --shadow-md: ${t.shadows.md};
  --shadow-lg: ${t.shadows.lg};
  --shadow-xl: ${t.shadows.xl};
  --shadow-2xl: ${t.shadows["2xl"]};
  --shadow-glow: ${t.shadows.glow};
  --shadow-glow-silver: ${t.shadows["glow-silver"]};
  --font-display: ${t.fonts.display};
  --font-body: ${t.fonts.body};
  --font-mono: ${t.fonts.mono};
}`;
}

export function getToken<K extends keyof DesignTokens>(
  tokens: DesignTokens,
  category: K,
  path: string,
): string {
  const keys = path.split(".");
  let value: unknown = tokens[category];
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return "";
    }
  }
  return String(value);
}

// Retrocompatibilidade — consumidores antigos usam o mood default (ember).
export const designTokens = buildDesignTokens("ember");

/** Bloco @theme completo para colar em src/index.css (Tailwind v4) — mood ember. */
export const forgeThemeBlock = buildThemeBlock("ember");

export const cssVariables = (() => {
  const t = designTokens;
  return `
  :root {
    --forge-color-brand-500: ${t.colors.brand[500]};
    --forge-color-brand-600: ${t.colors.brand[600]};
    --forge-color-accent-500: ${t.colors.accent[500]};
    --forge-color-surface-1: ${t.colors.surface[1]};
    --forge-color-surface-2: ${t.colors.surface[2]};
    --forge-color-surface-3: ${t.colors.surface[3]};
    --forge-color-surface-4: ${t.colors.surface[4]};
    --forge-color-background: ${t.colors.background};
    --forge-color-foreground: ${t.colors.foreground};
    --forge-color-border: ${t.colors.border};
    --forge-color-ring: ${t.colors.ring};
    --forge-shadow-glow: ${t.shadows.glow};
    --forge-font-display: ${t.fonts.display};
    --forge-font-body: ${t.fonts.body};
    --forge-font-mono: ${t.fonts.mono};
  }
`;
})();

export * from "./moods";
export * from "./design-guide";
