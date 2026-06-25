// design-enforcement.ts — Regras anti-genérico espelhadas do @forge/ui (Edge/Deno standalone).

import { getCompositeExports, getPhantomBanned } from "./design-manifest.ts";
import { getOpinionatedHeroExports } from "./design-validate-signatures.ts";

export const DESIGN_MISSION =
  "O usuário recebe, sem esforço, design absurdamente único — multi-componente, alta complexidade, NUNCA página branca + CTA azul. O design system é uma ESTRUTURA que deve ser ADAPTADA ao domínio específico do pedido (padaria usa composições quentes e de produto; app usa técnicas; sales usa conversão).";

/** Composites exportados de verdade — gerado de design_manifest.generated.json. */
export const KNOWN_FORGE_COMPOSITES: readonly string[] = getCompositeExports();

/** Nomes legados sem código — rejeitar se aparecerem como import. */
export const PHANTOM_BANNED_COMPOSITES: readonly string[] = getPhantomBanned();

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

/** @deprecated Prefer countManifestImports — contagem por substring infla falsos positivos. */
export function countForgeComposites(code: string): number {
  return listUsedCompositeExports(code).length;
}

export function countManifestImports(code: string): number {
  return listUsedCompositeExports(code).length;
}

/** Composites @forge/ui realmente importados ou usados em JSX. */
export function listUsedCompositeExports(code: string): string[] {
  const used = new Set<string>();
  for (const m of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@forge\/ui["']/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (KNOWN_FORGE_COMPOSITES.includes(name)) used.add(name);
    }
  }
  for (const composite of KNOWN_FORGE_COMPOSITES) {
    if (new RegExp(`<${composite}[\\s/>]`).test(code)) used.add(composite);
  }
  return [...used];
}

const OPINIONATED_HERO_EXPORTS = getOpinionatedHeroExports();

const MOTION_SIGNATURE =
  /FadeIn|SlideIn|ScaleIn|StaggerContainer|StaggerItem|HoverLift|Reveal|Parallax|useScrollProgress|TextShimmer|CountUp|Marquee/;

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

  for (const phantom of PHANTOM_BANNED_COMPOSITES) {
    if (new RegExp(`\\b${phantom}\\b`).test(code)) {
      violations.push({
        file,
        message: `${phantom} não existe em @forge/ui — use manifest (opinionated ou básico real)`,
      });
      break;
    }
  }

  return violations;
}

export function scanProjectForLandingQuality(files: Map<string, string>): DesignViolation[] {
  const violations: DesignViolation[] = [];
  const appFiles = [...files.entries()].filter(
    ([p]) => /App\.tsx|page\.tsx|index\.tsx/.test(p) && !p.includes("node_modules"),
  );

  for (const [file, code] of appFiles) {
    const used = listUsedCompositeExports(code);
    const compositeCount = used.length;
    const isLanding =
      /<main|<section|@forge\/ui/.test(code) &&
      (/<Hero|<Bento|<FeatureMatrix|<CTASignature|<NavShell/.test(code) || compositeCount > 0);

    // ponytail: composto criacional — não exige mais o MANDATO de ≥3 composites opinionated.
    // Aceita craft (≥4 seções distintas + motion) OU ≥3 composites @forge/ui. Assim uma página
    // ORIGINAL (sem colar composições) com ofício real passa; a rasa continua bloqueada.
    const sectionCount =
      (code.match(/<section\b/gi)?.length ?? 0) +
      (/hero/i.test(code) ? 1 : 0) +
      (/footer/i.test(code) ? 1 : 0) +
      (/<nav\b|navbar|navigation/i.test(code) ? 1 : 0);
    const hasMotion = MOTION_SIGNATURE.test(code);
    const craftSatisfied =
      compositeCount >= LANDING_MIN_COMPOSITES || (sectionCount >= 4 && hasMotion);
    if (isLanding && !craftSatisfied) {
      violations.push({
        file,
        message: `Landing sem ofício suficiente — use ≥${LANDING_MIN_COMPOSITES} composites @forge/ui OU ≥4 seções com motion. Composites: ${compositeCount}, seções: ${sectionCount} [${used.join(", ")}]`,
      });
    }

    const hasOpinionatedHero = used.some((n) => OPINIONATED_HERO_EXPORTS.includes(n));
    if (isLanding && used.includes("HeroSignature") && used.includes("BentoGrid") && !hasOpinionatedHero) {
      violations.push({
        file,
        message:
          "Stack genérica HeroSignature+BentoGrid — prefira composição opinionated do manifest (ex: HeroCinematicSpotlight)",
      });
    }

    if (isLanding && !MOTION_SIGNATURE.test(code)) {
      violations.push({
        file,
        message: "Landing sem motion — use FadeIn, Reveal, StaggerContainer, Parallax ou useScrollProgress",
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