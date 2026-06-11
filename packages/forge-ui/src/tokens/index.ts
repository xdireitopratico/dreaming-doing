export const designTokens = {
  colors: {
    brand: {
      50: "#FFFAE5",
      100: "#FFF3C4",
      200: "#FFE899",
      300: "#FFD966",
      400: "#FFC933",
      500: "#FFB627",
      600: "#FF7A1A",
      700: "#E65C00",
      800: "#B33D00",
      900: "#802600",
    },
    accent: {
      50: "#F0FDF4",
      100: "#DCFCE7",
      200: "#BBF7D0",
      300: "#86EFAC",
      400: "#4ADE80",
      500: "#22C55E",
      600: "#16A34A",
      700: "#15803D",
      800: "#166534",
      900: "#14532D",
    },
    neutral: {
      50: "#F8FAFC",
      100: "#F1F5F9",
      200: "#E2E8F0",
      300: "#CBD5E1",
      400: "#94A3B8",
      500: "#64748B",
      600: "#475569",
      700: "#334155",
      800: "#1E293B",
      900: "#0F172A",
      950: "#020617",
    },
    surface: {
      1: "#0B0D12",
      2: "#12151C",
      3: "#1A1E27",
      4: "#252A36",
    },
    background: "#05060A",
    foreground: "#EDEFF2",
    border: "rgba(237, 239, 242, 0.08)",
    ring: "#FFB627",
  },
  spacing: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
    24: "6rem",
  },
  radius: {
    none: "0",
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    "2xl": "1rem",
    full: "9999px",
  },
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
    glow: "0 0 32px rgba(255, 182, 39, 0.32), 0 0 80px rgba(255, 122, 26, 0.18)",
    "glow-silver": "0 0 24px rgba(201, 206, 214, 0.18)",
  },
  fonts: {
    display: '"Space Grotesk", system-ui, sans-serif',
    body: '"Inter", system-ui, sans-serif',
    mono: '"Share Tech Mono", "Fira Code", "Consolas", monospace',
  },
  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
    "6xl": "3.75rem",
  },
  transitions: {
    fast: "150ms ease",
    normal: "200ms ease",
    slow: "300ms ease",
  },
  breakpoints: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 100,
    sticky: 200,
    overlay: 300,
    modal: 400,
    popover: 500,
    toast: 600,
    tooltip: 700,
  },
} as const;

export type DesignTokens = typeof designTokens;

export * from "./anti-generic";

/** Bloco @theme completo para colar em src/index.css (Tailwind v4). */
export const forgeThemeBlock = `@theme {
  --color-brand-50: ${designTokens.colors.brand[50]};
  --color-brand-100: ${designTokens.colors.brand[100]};
  --color-brand-200: ${designTokens.colors.brand[200]};
  --color-brand-300: ${designTokens.colors.brand[300]};
  --color-brand-400: ${designTokens.colors.brand[400]};
  --color-brand-500: ${designTokens.colors.brand[500]};
  --color-brand-600: ${designTokens.colors.brand[600]};
  --color-brand-700: ${designTokens.colors.brand[700]};
  --color-brand-800: ${designTokens.colors.brand[800]};
  --color-brand-900: ${designTokens.colors.brand[900]};
  --color-brand-500-foreground: #0B0D12;
  --color-accent-500: ${designTokens.colors.accent[500]};
  --color-accent-600: ${designTokens.colors.accent[600]};
  --color-surface-1: ${designTokens.colors.surface[1]};
  --color-surface-2: ${designTokens.colors.surface[2]};
  --color-surface-3: ${designTokens.colors.surface[3]};
  --color-surface-4: ${designTokens.colors.surface[4]};
  --color-background: ${designTokens.colors.background};
  --color-foreground: ${designTokens.colors.foreground};
  --color-muted-foreground: #94A3B8;
  --color-border: color-mix(in srgb, ${designTokens.colors.foreground} 8%, transparent);
  --color-destructive: #E5484D;
  --color-destructive-foreground: #FAFAFA;
  --color-success: #22C55E;
  --color-ring: ${designTokens.colors.ring};
  --radius-sm: ${designTokens.radius.sm};
  --radius-md: ${designTokens.radius.md};
  --radius-lg: ${designTokens.radius.lg};
  --radius-xl: ${designTokens.radius.xl};
  --radius-2xl: ${designTokens.radius["2xl"]};
  --radius-full: ${designTokens.radius.full};
  --shadow-sm: ${designTokens.shadows.sm};
  --shadow-md: ${designTokens.shadows.md};
  --shadow-lg: ${designTokens.shadows.lg};
  --shadow-xl: ${designTokens.shadows.xl};
  --shadow-2xl: ${designTokens.shadows["2xl"]};
  --shadow-glow: ${designTokens.shadows.glow};
  --shadow-glow-silver: ${designTokens.shadows["glow-silver"]};
  --font-display: ${designTokens.fonts.display};
  --font-body: ${designTokens.fonts.body};
  --font-mono: ${designTokens.fonts.mono};
}`;

export function getToken<K extends keyof DesignTokens>(category: K, path: string): string {
  const keys = path.split(".");
  let value: unknown = designTokens[category];
  for (const key of keys) {
    if (value && typeof value === "object" && key in value) {
      value = (value as Record<string, unknown>)[key];
    } else {
      return "";
    }
  }
  return String(value);
}

export const cssVariables = `
  :root {
    --forge-color-brand-50: ${designTokens.colors.brand[50]};
    --forge-color-brand-100: ${designTokens.colors.brand[100]};
    --forge-color-brand-200: ${designTokens.colors.brand[200]};
    --forge-color-brand-300: ${designTokens.colors.brand[300]};
    --forge-color-brand-400: ${designTokens.colors.brand[400]};
    --forge-color-brand-500: ${designTokens.colors.brand[500]};
    --forge-color-brand-600: ${designTokens.colors.brand[600]};
    --forge-color-brand-700: ${designTokens.colors.brand[700]};
    --forge-color-brand-800: ${designTokens.colors.brand[800]};
    --forge-color-brand-900: ${designTokens.colors.brand[900]};
    --forge-color-accent-500: ${designTokens.colors.accent[500]};
    --forge-color-accent-600: ${designTokens.colors.accent[600]};
    --forge-color-surface-1: ${designTokens.colors.surface[1]};
    --forge-color-surface-2: ${designTokens.colors.surface[2]};
    --forge-color-surface-3: ${designTokens.colors.surface[3]};
    --forge-color-surface-4: ${designTokens.colors.surface[4]};
    --forge-color-background: ${designTokens.colors.background};
    --forge-color-foreground: ${designTokens.colors.foreground};
    --forge-color-border: ${designTokens.colors.border};
    --forge-color-ring: ${designTokens.colors.ring};
    --forge-radius-sm: ${designTokens.radius.sm};
    --forge-radius-md: ${designTokens.radius.md};
    --forge-radius-lg: ${designTokens.radius.lg};
    --forge-radius-xl: ${designTokens.radius.xl};
    --forge-radius-2xl: ${designTokens.radius["2xl"]};
    --forge-radius-full: ${designTokens.radius.full};
    --forge-shadow-sm: ${designTokens.shadows.sm};
    --forge-shadow-md: ${designTokens.shadows.md};
    --forge-shadow-lg: ${designTokens.shadows.lg};
    --forge-shadow-xl: ${designTokens.shadows.xl};
    --forge-shadow-2xl: ${designTokens.shadows["2xl"]};
    --forge-shadow-glow: ${designTokens.shadows.glow};
    --forge-shadow-glow-silver: ${designTokens.shadows["glow-silver"]};
    --forge-font-display: ${designTokens.fonts.display};
    --forge-font-body: ${designTokens.fonts.body};
    --forge-font-mono: ${designTokens.fonts.mono};
    --forge-font-size-xs: ${designTokens.fontSizes.xs};
    --forge-font-size-sm: ${designTokens.fontSizes.sm};
    --forge-font-size-base: ${designTokens.fontSizes.base};
    --forge-font-size-lg: ${designTokens.fontSizes.lg};
    --forge-font-size-xl: ${designTokens.fontSizes.xl};
    --forge-font-size-2xl: ${designTokens.fontSizes["2xl"]};
    --forge-font-size-3xl: ${designTokens.fontSizes["3xl"]};
    --forge-font-size-4xl: ${designTokens.fontSizes["4xl"]};
    --forge-font-size-5xl: ${designTokens.fontSizes["5xl"]};
    --forge-font-size-6xl: ${designTokens.fontSizes["6xl"]};
    --forge-transition-fast: ${designTokens.transitions.fast};
    --forge-transition-normal: ${designTokens.transitions.normal};
    --forge-transition-slow: ${designTokens.transitions.slow};
  }
`;
