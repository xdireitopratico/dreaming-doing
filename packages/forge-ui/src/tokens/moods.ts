/**
 * Design moods — a identidade visual deixa de ser uma CONSTANTE (paleta laranja
 * fixa) e vira uma FUNÇÃO do contexto. Cada mood é uma paleta completa e
 * distinta; o agente escolhe/customiza conforme o domínio (padaria ≠ SaaS ≠
 * cyberpunk). É o que destrava variedade sem virar mandato.
 */

export type DesignMood =
  | "ember"
  | "ocean"
  | "forest"
  | "mono"
  | "neon"
  | "sand"
  | "royal"
  | "sunset";

export type BrandScale = Record<
  50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900,
  string
>;

export interface MoodPalette {
  id: DesignMood;
  label: string;
  /** Quando usar — orienta o agente sem obrigar. */
  when: string;
  dark: boolean;
  brand: BrandScale;
  /** Cor de legibilidade sobre brand-500 (botões, etc.). */
  brandForeground: string;
  accent: { 500: string; 600: string };
  surface: { 1: string; 2: string; 3: string; 4: string };
  background: string;
  foreground: string;
  ring: string;
  /** Box-shadow de glow — assinatura luminosa do mood. */
  glow: string;
}

export const MOODS: Record<DesignMood, MoodPalette> = {
  ember: {
    id: "ember",
    label: "Ember",
    when: "marcas quentes/energéticas, food, criativo, identidade FORGE",
    dark: true,
    brand: {
      50: "#FFFAE5", 100: "#FFF3C4", 200: "#FFE899", 300: "#FFD966",
      400: "#FFC933", 500: "#FFB627", 600: "#FF7A1A", 700: "#E65C00",
      800: "#B33D00", 900: "#802600",
    },
    brandForeground: "#0B0D12",
    accent: { 500: "#22C55E", 600: "#16A34A" },
    surface: { 1: "#0B0D12", 2: "#12151C", 3: "#1A1E27", 4: "#252A36" },
    background: "#05060A",
    foreground: "#EDEFF2",
    ring: "#FFB627",
    glow: "0 0 32px rgba(255, 182, 39, 0.32), 0 0 80px rgba(255, 122, 26, 0.18)",
  },
  ocean: {
    id: "ocean",
    label: "Ocean",
    when: "SaaS, fintech, dev tools, data — tech confiável e profundo",
    dark: true,
    brand: {
      50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE", 300: "#93C5FD",
      400: "#60A5FA", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8",
      800: "#1E40AF", 900: "#1E3A8A",
    },
    brandForeground: "#FFFFFF",
    accent: { 500: "#2DD4BF", 600: "#14B8A6" },
    surface: { 1: "#0B1120", 2: "#131C31", 3: "#1B2740", 4: "#283656" },
    background: "#060912",
    foreground: "#E6EDF7",
    ring: "#3B82F6",
    glow: "0 0 32px rgba(59, 130, 246, 0.32), 0 0 80px rgba(14, 165, 233, 0.18)",
  },
  forest: {
    id: "forest",
    label: "Forest",
    when: "eco, saúde, natureza, agricultura, bem-estar",
    dark: true,
    brand: {
      50: "#F0FDF4", 100: "#DCFCE7", 200: "#BBF7D0", 300: "#86EFAC",
      400: "#4ADE80", 500: "#22C55E", 600: "#16A34A", 700: "#15803D",
      800: "#166534", 900: "#14532D",
    },
    brandForeground: "#04130A",
    accent: { 500: "#EAB308", 600: "#CA8A04" },
    surface: { 1: "#0A120C", 2: "#121C16", 3: "#1A2A1F", 4: "#26382D" },
    background: "#050A07",
    foreground: "#E8F2EC",
    ring: "#22C55E",
    glow: "0 0 32px rgba(34, 197, 94, 0.30), 0 0 80px rgba(132, 204, 22, 0.16)",
  },
  mono: {
    id: "mono",
    label: "Mono",
    when: "minimal premium, editorial, portfólio, agência — elegância pelo contraste",
    dark: true,
    brand: {
      50: "#FAFAFA", 100: "#F4F4F5", 200: "#E4E4E7", 300: "#D4D4D8",
      400: "#A1A1AA", 500: "#71717A", 600: "#52525B", 700: "#3F3F46",
      800: "#27272A", 900: "#18181B",
    },
    brandForeground: "#FAFAFA",
    accent: { 500: "#E5E7EB", 600: "#D1D5DB" },
    surface: { 1: "#0A0A0A", 2: "#121212", 3: "#1A1A1A", 4: "#262626" },
    background: "#050505",
    foreground: "#FAFAFA",
    ring: "#FAFAFA",
    glow: "0 0 32px rgba(250, 250, 250, 0.12), 0 0 80px rgba(250, 250, 250, 0.06)",
  },
  neon: {
    id: "neon",
    label: "Neon",
    when: "cyberpunk, gaming, web3, dev tooling extremo — alta energia",
    dark: true,
    brand: {
      50: "#FDF4FF", 100: "#FAE8FF", 200: "#F5D0FE", 300: "#F0ABFC",
      400: "#E879F9", 500: "#D946EF", 600: "#C026D3", 700: "#A21CAF",
      800: "#86198F", 900: "#581C87",
    },
    brandForeground: "#FFFFFF",
    accent: { 500: "#22D3EE", 600: "#06B6D4" },
    surface: { 1: "#0A0612", 2: "#14091F", 3: "#1E0E2E", 4: "#2E1547" },
    background: "#050208",
    foreground: "#F3E8FF",
    ring: "#D946EF",
    glow: "0 0 32px rgba(217, 70, 239, 0.35), 0 0 80px rgba(34, 211, 238, 0.20)",
  },
  sand: {
    id: "sand",
    label: "Sand",
    when: "padaria, gourmet, lifestyle, artesanato — claro, acolhedor, terroso",
    dark: false,
    brand: {
      50: "#FFF7ED", 100: "#FFEDD5", 200: "#FED7AA", 300: "#FDBA74",
      400: "#FB923C", 500: "#C2410C", 600: "#9A3412", 700: "#7C2D12",
      800: "#5C1F0B", 900: "#3F1607",
    },
    brandForeground: "#FFFFFF",
    accent: { 500: "#65A30D", 600: "#4D7C0F" },
    surface: { 1: "#FAF7F2", 2: "#F2EDE4", 3: "#E8E0D2", 4: "#D9CFBE" },
    background: "#FFFBF5",
    foreground: "#2A2419",
    ring: "#C2410C",
    glow: "0 0 32px rgba(194, 65, 12, 0.18), 0 0 80px rgba(194, 65, 12, 0.10)",
  },
  royal: {
    id: "royal",
    label: "Royal",
    when: "luxo, criativo, imobiliário premium, joias — roxo + dourado",
    dark: true,
    brand: {
      50: "#F5F3FF", 100: "#EDE9FE", 200: "#DDD6FE", 300: "#C4B5FD",
      400: "#A78BFA", 500: "#8B5CF6", 600: "#7C3AED", 700: "#6D28D9",
      800: "#5B21B6", 900: "#4C1D95",
    },
    brandForeground: "#FFFFFF",
    accent: { 500: "#EAB308", 600: "#CA8A04" },
    surface: { 1: "#0E0A1A", 2: "#16112A", 3: "#201738", 4: "#2E2050" },
    background: "#07050F",
    foreground: "#EEE8FA",
    ring: "#8B5CF6",
    glow: "0 0 32px rgba(139, 92, 246, 0.32), 0 0 80px rgba(234, 179, 8, 0.14)",
  },
  sunset: {
    id: "sunset",
    label: "Sunset",
    when: "lifestyle, moda, beleza, criativo jovem — magenta + laranja",
    dark: true,
    brand: {
      50: "#FDF2F8", 100: "#FCE7F3", 200: "#FBCFE8", 300: "#F9A8D4",
      400: "#F472B6", 500: "#EC4899", 600: "#DB2777", 700: "#BE185D",
      800: "#9D174D", 900: "#831843",
    },
    brandForeground: "#FFFFFF",
    accent: { 500: "#F97316", 600: "#EA580C" },
    surface: { 1: "#140A10", 2: "#1F0E18", 3: "#2C1422", 4: "#421D31" },
    background: "#0A0508",
    foreground: "#FBE8F0",
    ring: "#EC4899",
    glow: "0 0 32px rgba(236, 72, 153, 0.32), 0 0 80px rgba(249, 115, 22, 0.18)",
  },
};

export const MOOD_IDS = Object.keys(MOODS) as DesignMood[];

export function isDesignMood(value: string): value is DesignMood {
  return value in MOODS;
}

/** Heurística leve de mood por domínio/descricao — sugestão, nunca obrigação. */
export function suggestMoodForDomain(domain: string): DesignMood {
  const d = domain.toLowerCase();
  if (/\b(padaria|bakery|pão|pao|café|cafe|coffee|gourmet|receita|food|restaurante|recipe)\b/.test(d))
    return "sand";
  if (/\b(saas|fintech|fiance|finance|bank|banco|dev tool|dashboard|data|analytics|crm|erp)\b/.test(d))
    return "ocean";
  if (/\b(eco|sustain|verde|sustain|health|saúde|saude|nature|farm|agro|yoga|wellness)\b/.test(d))
    return "forest";
  if (/\b(cyber|cyberpunk|game|gaming|web3|crypto|nft|hacker|neon)\b/.test(d))
    return "neon";
  if (/\b(lux|luxo|premium|imobili|jewel|joia|creative agency|estúdio|estudio)\b/.test(d))
    return "royal";
  if (/\b(fashion|moda|beauty|beleza|lifestyle|jovem|criativo|social)\b/.test(d))
    return "sunset";
  if (/\b(minimal|editorial|portfolio|portfólio|agência|agencia|studio|mono)\b/.test(d))
    return "mono";
  return "ember";
}
