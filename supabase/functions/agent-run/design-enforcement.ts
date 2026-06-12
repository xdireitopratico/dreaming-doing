// design-enforcement.ts — Regras anti-genérico espelhadas do @forge/ui (Edge/Deno standalone).

export const DESIGN_MISSION =
  "O usuário recebe, sem esforço, design absurdamente único — multi-componente, alta complexidade, NUNCA página branca + CTA azul. O design system é uma ESTRUTURA que deve ser ADAPTADA ao domínio específico do pedido (padaria usa composições quentes e de produto; app usa técnicas; sales usa conversão).";

/** Catálogo de composites conhecidos — qualquer subconjunto válido, não lista fixa obrigatória. */
export const KNOWN_FORGE_COMPOSITES = [
  "HeroSignature",
  "BentoGrid",
  "FeatureMatrix",
  "CTASignature",
  "NavShell",
  "StatsRibbon",
  "PricingTiers",
  "TestimonialCarousel",
  "FooterColumns",
  "LogoWall",
  "FAQAccordion",
  "TeamGrid",
  "MarqueeStrip",
  "SplitFeature",
  "MediaGallery",
  "ContactForm",
  "NewsletterSignup",
  "AppScreenshot",
  "ComparisonTable",
  "TimelineVertical",
  "ProcessSteps",
  "TrustBar",
  "CaseStudyCard",
  "AnnouncementBar",
  "StickyCTA",
  "SplitHero",
  "VideoHero",
  "ProductShowcase",
  "ServiceGrid",
  "LocationMap",
  "BookingWidget",
  "ReviewGrid",
  "GalleryMasonry",
  "PressMentions",
  "IntegrationGrid",
  "DashboardPreview",
  "MetricCards",
  "OnboardingSteps",
] as const;

/** @deprecated Use KNOWN_FORGE_COMPOSITES — mantido para compat de imports. */
export const REQUIRED_COMPOSITES = KNOWN_FORGE_COMPOSITES;

export const LANDING_MIN_COMPOSITES = 3;

export const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /#[0-9a-fA-F]{3,8}/, message: "Hex hardcoded — use tokens @theme" },
  { pattern: /\brounded-\[/, message: "Radius arbitrário — use rounded-lg/xl/2xl" },
];

export const FORBIDDEN_REIMPLEMENT = [
  /from\s+["']@radix-ui\/react-slot["']/,
  /from\s+["']class-variance-authority["']/,
  /\bcva\(/,
  /\bbuttonVariants\s*=/,
];

/** Paths profundos não exportados pelo pacote seed — só "@forge/ui" ou "@forge/ui/components" (index). */
export const INVALID_FORGE_UI_DEEP_IMPORT =
  /from\s+["']@forge\/ui\/(components|composites|patterns|hooks|tokens|utils)\/[^"']+["']/g;

export const INVALID_FORGE_UI_IMPORT_MESSAGE =
  'Importe apenas de "@forge/ui" — paths como @forge/ui/components/Motion não existem no bundle';

export interface DesignViolation {
  file: string;
  message: string;
}

export function countForgeComposites(code: string): number {
  return KNOWN_FORGE_COMPOSITES.filter((c) => code.includes(c)).length;
}

export function scanFileForViolations(file: string, code: string): DesignViolation[] {
  const violations: DesignViolation[] = [];

  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(code)) {
      violations.push({ file, message });
    }
  }

  for (const pattern of FORBIDDEN_REIMPLEMENT) {
    if (pattern.test(code) && !code.includes("@forge/ui")) {
      violations.push({ file, message: "Reimplementando componente base — importe de @forge/ui" });
      break;
    }
  }

  if (INVALID_FORGE_UI_DEEP_IMPORT.test(code)) {
    violations.push({ file, message: INVALID_FORGE_UI_IMPORT_MESSAGE });
    INVALID_FORGE_UI_DEEP_IMPORT.lastIndex = 0;
  }

  const hasUIComponents = /<(Button|Input|Card|Dialog|HeroSignature|BentoGrid|CTASignature)/.test(
    code,
  );
  if (hasUIComponents && !code.includes("@forge/ui")) {
    violations.push({ file, message: "Usa componentes UI sem importar @forge/ui" });
  }

  if (
    /<button[^>]*className=/.test(code) &&
    !code.includes("<Button") &&
    !code.includes("@forge/ui")
  ) {
    violations.push({
      file,
      message: "Use <Button> de @forge/ui em vez de <button> estilizado manualmente",
    });
  }

  return violations;
}

export function scanProjectForLandingQuality(files: Map<string, string>): DesignViolation[] {
  const violations: DesignViolation[] = [];
  const appFiles = [...files.entries()].filter(
    ([p]) => /App\.tsx|page\.tsx|index\.tsx/.test(p) && !p.includes("node_modules"),
  );

  for (const [file, code] of appFiles) {
    const compositeCount = countForgeComposites(code);
    const isLanding = /<main|<HeroSignature|<section/.test(code);

    if (isLanding && compositeCount < LANDING_MIN_COMPOSITES) {
      violations.push({
        file,
        message: `Landing precisa de ≥${LANDING_MIN_COMPOSITES} composites @forge/ui (qualquer combinação adequada ao domínio) — encontrados: ${compositeCount}`,
      });
    }

    const hasMotion = /FadeIn|SlideIn|StaggerContainer|HoverLift|ScaleIn/.test(code);
    if (isLanding && !hasMotion) {
      violations.push({
        file,
        message: "Landing sem motion — adicione FadeIn, StaggerContainer ou HoverLift",
      });
    }

    if (
      /\bbg-zinc-950\b|\bbg-gray-50\b/.test(code) &&
      !code.includes("bg-background") &&
      !code.includes("bg-surface")
    ) {
      violations.push({
        file,
        message: "Paleta raw (zinc/gray) — migre para bg-background e tokens @theme",
      });
    }
  }

  return violations;
}

export function formatDesignFeedback(violations: DesignViolation[]): string {
  if (violations.length === 0)
    return "Design System OK: @forge/ui + composites diversos + tokens válidos + adaptação ao domínio";
  const unique = violations.slice(0, 20);
  const base = unique.map((v) => `${v.file}: ${v.message}`).join("\n");
  return `${base}\n\nLembrete: adapte composição ao domínio do pedido — evite repetir a mesma stack de seções entre projetos.`;
}