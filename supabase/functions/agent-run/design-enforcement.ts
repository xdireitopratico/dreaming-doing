// design-enforcement.ts — Regras anti-genérico espelhadas do @forge/ui (Edge/Deno standalone).

export const DESIGN_MISSION =
  "O usuário recebe, sem esforço, design absurdamente único — multi-componente, alta complexidade, NUNCA página branca + CTA azul.";

export const REQUIRED_COMPOSITES = [
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

export const LANDING_MIN_COMPOSITES = 3;

export const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bbg-white\b/, message: "Fundo branco proibido — use bg-background ou bg-surface-*" },
  { pattern: /\bbg-blue-[456]00\b/, message: "CTA azul genérico — use Button @forge/ui (variant primary)" },
  { pattern: /\btext-blue-[456]00\b/, message: "Texto azul Tailwind raw — use text-brand-500" },
  { pattern: /\bhover:bg-blue-\d+/, message: "Hover azul genérico — use tokens brand" },
  { pattern: /\bfrom-blue-\d+/, message: "Gradiente azul genérico — use brand/accent tokens" },
  { pattern: /#[0-9a-fA-F]{3,8}/, message: "Hex hardcoded — use tokens @theme" },
  { pattern: /\brounded-\[/, message: "Radius arbitrário — use rounded-lg/xl/2xl" },
];

export const FORBIDDEN_RAW_TAILWIND = [
  /bg-(gray|slate|zinc|neutral|stone|sky|blue|indigo)-\d+/g,
  /text-(gray|slate|zinc|neutral|stone|sky|blue|indigo)-\d+/g,
  /border-(gray|slate|zinc|neutral|stone|sky|blue|indigo)-\d+/g,
];

export const FORBIDDEN_REIMPLEMENT = [
  /from\s+["']@radix-ui\/react-slot["']/,
  /from\s+["']class-variance-authority["']/,
  /\bcva\(/,
  /\bbuttonVariants\s*=/,
];

export interface DesignViolation {
  file: string;
  message: string;
}

export function scanFileForViolations(file: string, code: string): DesignViolation[] {
  const violations: DesignViolation[] = [];

  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      violations.push({ file, message });
    }
  }

  for (const pattern of FORBIDDEN_RAW_TAILWIND) {
    const matches = code.match(pattern);
    if (matches) {
      violations.push({
        file,
        message: `Tailwind raw sem token: ${matches.slice(0, 3).join(", ")}`,
      });
    }
  }

  for (const pattern of FORBIDDEN_REIMPLEMENT) {
    if (pattern.test(code) && !code.includes("@forge/ui")) {
      violations.push({ file, message: "Reimplementando componente base — importe de @forge/ui" });
      break;
    }
  }

  const hasUIComponents = /<(Button|Input|Card|Dialog|HeroSignature|BentoGrid|CTASignature)/.test(code);
  if (hasUIComponents && !code.includes("@forge/ui")) {
    violations.push({ file, message: "Usa componentes UI sem importar @forge/ui" });
  }

  if (/<button[^>]*className=/.test(code) && !code.includes("<Button") && !code.includes("@forge/ui")) {
    violations.push({ file, message: "Use <Button> de @forge/ui em vez de <button> estilizado manualmente" });
  }

  return violations;
}

export function scanProjectForLandingQuality(files: Map<string, string>): DesignViolation[] {
  const violations: DesignViolation[] = [];
  const appFiles = [...files.entries()].filter(([p]) =>
    /App\.tsx|page\.tsx|index\.tsx/.test(p) && !p.includes("node_modules"),
  );

  for (const [file, code] of appFiles) {
    const compositeCount = REQUIRED_COMPOSITES.filter((c) => code.includes(c)).length;
    const isLanding = /<main|<HeroSignature|<section/.test(code);

    if (isLanding && compositeCount < LANDING_MIN_COMPOSITES) {
      violations.push({
        file,
        message: `Landing precisa de ≥${LANDING_MIN_COMPOSITES} composites @forge/ui (HeroSignature, BentoGrid, CTASignature, NavShell, etc.) — encontrados: ${compositeCount}`,
      });
    }

    const hasMotion = /FadeIn|SlideIn|StaggerContainer|HoverLift|ScaleIn/.test(code);
    if (isLanding && !hasMotion) {
      violations.push({
        file,
        message: "Landing sem motion — adicione FadeIn, StaggerContainer ou HoverLift",
      });
    }

    if (/\bbg-zinc-950\b|\bbg-gray-50\b/.test(code) && !code.includes("bg-background") && !code.includes("bg-surface")) {
      violations.push({
        file,
        message: "Paleta raw (zinc/gray) — migre para bg-background e tokens @theme",
      });
    }
  }

  return violations;
}

export function formatDesignFeedback(violations: DesignViolation[]): string {
  if (violations.length === 0) return "Design System OK: @forge/ui + composites + tokens válidos";
  const unique = violations.slice(0, 20);
  return unique.map((v) => `${v.file}: ${v.message}`).join("\n");
}