/** Regras explícitas contra UI genérica (página branca + CTA azul). */

export const ANTI_GENERIC_MISSION =
  "O usuário recebe, sem esforço, design absurdamente único — multi-componente, alta complexidade visual, nunca página branca com botão azul padrão.";

export const FORBIDDEN_CLASS_PATTERNS: RegExp[] = [
  /\bbg-white\b/,
  /\bbg-blue-[456]00\b/,
  /\btext-blue-[456]00\b/,
  /\bfrom-blue-\d+/,
  /\bto-blue-\d+/,
  /\bhover:bg-blue-\d+/,
  /\brounded-\[.*?\]/,
  /#[0-9a-fA-F]{3,8}/,
];

export const FORBIDDEN_RAW_TAILWIND: RegExp[] = [
  /bg-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/g,
  /text-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/g,
  /border-(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+/g,
];

export const REQUIRED_COMPOSITE_IMPORTS = [
  "HeroSignature",
  "BentoGrid",
  "FeatureMatrix",
  "CTASignature",
  "NavShell",
  "StatsRibbon",
  "PricingTiers",
  "TestimonialCarousel",
  "FooterColumns",
] as const;

export type ForgeComposite = (typeof REQUIRED_COMPOSITE_IMPORTS)[number];

export const LANDING_MIN_COMPOSITES = 3;
export const LANDING_MIN_SECTIONS = 4;

export const ANTI_GENERIC_CHECKLIST = [
  "Fundo escuro com superfícies em camadas (bg-background, bg-surface-*) — nunca bg-white dominante",
  "CTA via Button @forge/ui (variant primary/secondary) dentro de HeroSignature ou CTASignature — nunca botão azul Tailwind solto",
  "Mínimo 3 composites @forge/ui em páginas de marketing/landing",
  "Motion obrigatório: FadeIn, StaggerContainer ou HoverLift em pelo menos 2 seções",
  "Tipografia display (font-display) no hero + hierarquia h1→h2→h3",
  "Tokens @theme — zero hex hardcoded em TSX",
  "NavShell + FooterColumns em layouts completos",
  "BentoGrid assimétrico ou FeatureMatrix — nunca grid 3 colunas idênticas sem assinatura",
] as const;

export function scoreAntiGeneric(code: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  for (const pattern of FORBIDDEN_CLASS_PATTERNS) {
    if (pattern.test(code)) {
      issues.push(`Classe/padrão proibido: ${pattern.source}`);
      score -= 15;
    }
  }

  const compositeCount = REQUIRED_COMPOSITE_IMPORTS.filter((c) => code.includes(c)).length;
  if (compositeCount === 0 && /<main|<section/.test(code)) {
    issues.push("Página sem composites @forge/ui — use HeroSignature, BentoGrid, CTASignature, etc.");
    score -= 25;
  }

  if (/className=.*bg-white/.test(code)) {
    issues.push("Fundo branco detectado — use bg-background ou bg-surface-*");
    score -= 20;
  }

  if (/<button[^>]*className=[^>]*blue/.test(code) && !code.includes("@forge/ui")) {
    issues.push("CTA genérico azul — use <Button> de @forge/ui dentro de CTASignature");
    score -= 25;
  }

  return { score: Math.max(0, score), issues };
}