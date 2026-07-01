/**
 * REFERO — DNA Structural Validator
 *
 * Validates extracted Design DNA for completeness, consistency,
 * specificity, and actionability. Auto-fixes where possible.
 * Rejects DNA that doesn't meet minimum quality thresholds.
 */

import type { DNAValidation } from "./refero-types.ts";

// ─── Public API ──────────────────────────────────────────────────

export type ValidateDNAInput = {
  dna: Record<string, unknown>;
  screenshotAvailable: boolean;
  multiViewportAvailable: boolean;
  cssDataAvailable: boolean;
  componentsFromDOM: number;
  sectionsDetected: number;
  scrapeProviderCount: number;
};

export type ValidateDNAOutput = {
  validation: DNAValidation;
  /** If true, the DNA should be re-extracted (not saved) */
  reject: boolean;
  /** If true, auto-fixes were applied to the DNA object */
  fixed: boolean;
  /** The (possibly auto-fixed) DNA object */
  dna: Record<string, unknown>;
};

/**
 * Validates a Design DNA extraction result.
 * Returns validation score, issues, auto-fixes, and a verdict.
 */
export function validateDNA(input: ValidateDNAInput): ValidateDNAOutput {
  const dna = { ...input.dna };
  const issues: string[] = [];
  const autoFixes: string[] = [];
  let fixed = false;

  // ── 1. COMPLETENESS (0-100) ──────────────────────────────────────
  const coreFields = ["layout", "color", "typography", "motion", "interaction", "component"];
  const optionalFields = ["implementation_notes", "serves_domains", "compatible_languages", "compatible_moods"];
  const filledCore = coreFields.filter((f) => isNonEmpty(dna[f]));
  const filledOptional = optionalFields.filter((f) => isNonEmpty(dna[f]));
  const completeness = Math.round(
    ((filledCore.length / coreFields.length) * 70 + (filledOptional.length / optionalFields.length) * 30),
  );

  if (filledCore.length < 3) {
    issues.push(`Only ${filledCore.length}/6 core fields filled — DNA is too sparse`);
  }

  // ── 2. CONSISTENCY (0-100) ──────────────────────────────────────

  let consistencyScore = 100;
  const consistencyDeductions: number[] = [];

  // Check layout fields are valid
  const layout = dna.layout as Record<string, unknown> | null;
  if (layout) {
    if (typeof layout.asymmetry_level === "string") {
      const num = parseFloat(layout.asymmetry_level as string);
      if (!isNaN(num) && num >= 0 && num <= 1) {
        layout.asymmetry_level = num;
        autoFixes.push("Fixed layout.asymmetry_level: string → number");
        fixed = true;
      } else {
        consistencyDeductions.push(15);
        issues.push("layout.asymmetry_level is not a valid 0.0-1.0 number");
      }
    }
    if (layout.asymmetry_level !== undefined && typeof layout.asymmetry_level === "number") {
      if (layout.asymmetry_level < 0 || layout.asymmetry_level > 1) {
        consistencyDeductions.push(10);
        issues.push("layout.asymmetry_level out of range [0, 1]");
      }
    }
  }

  // Check color fields are specific (not generic)
  const color = dna.color as Record<string, unknown> | null;
  if (color) {
    const genericPhrases = ["não informado", "not specified", "unknown", "n/a", "none", "padrão"];
    for (const [key, value] of Object.entries(color)) {
      if (typeof value === "string" && genericPhrases.some((p) => value.toLowerCase().includes(p))) {
        consistencyDeductions.push(8);
        issues.push(`color.${key} contains generic placeholder text`);
        (color as Record<string, unknown>)[key] = null;
        autoFixes.push(`Removed generic placeholder from color.${key}`);
        fixed = true;
      }
    }
  }

  // Check typography has real font names
  const typography = dna.typography as Record<string, unknown> | null;
  if (typography) {
    const fontStack = String(typography.font_stack ?? "");
    if (fontStack && !fontStack.match(/[A-Z][a-z]/)) {
      // No proper font names detected (all generic like "sans-serif", "Arial")
      if (!fontStack.match(/Inter|Playfair|Geist|Roboto|Open.?Sans|Montserrat|Poppins|Helvetica|Futura|Söhne/i)) {
        consistencyDeductions.push(10);
        issues.push("typography.font_stack contains no identifiable font family");
      }
    }
    // Validate weight_hierarchy is array of numbers
    if (Array.isArray(typography.weight_hierarchy)) {
      const allNumbers = typography.weight_hierarchy.every(
        (w: unknown) => typeof w === "number" && w >= 100 && w <= 900,
      );
      if (!allNumbers) {
        consistencyDeductions.push(8);
        issues.push("typography.weight_hierarchy contains non-numeric or out-of-range values");
      }
    }
  }

  // Check motion has real values
  const motion = dna.motion as Record<string, unknown> | null;
  if (motion) {
    if (typeof motion.duration === "string") {
      const num = parseInt(motion.duration as string, 10);
      if (!isNaN(num) && num > 0) {
        motion.duration = num;
        autoFixes.push("Fixed motion.duration: string → number (ms)");
        fixed = true;
      } else if (genericDurationPhrases.some((p) => (motion.duration as string).toLowerCase().includes(p))) {
        consistencyDeductions.push(10);
        issues.push("motion.duration is generic text, not a numeric ms value");
      }
    }
    // Validate easing is a real CSS value
    if (typeof motion.easing === "string") {
      const easing = motion.easing as string;
      const isGeneric = ["smooth", "suave", "linear", "ease", "padrão", "default"].includes(easing.toLowerCase());
      if (isGeneric && !easing.includes("cubic-bezier")) {
        issues.push("motion.easing is generic — should be cubic-bezier or specific easing");
        consistencyDeductions.push(5);
      }
    }
  }

  // Check components have proper anatomy
  const components = dna.component;
  if (Array.isArray(components)) {
    let badAnatomyCount = 0;
    for (const comp of components) {
      if (typeof comp === "object" && comp !== null) {
        const anatomy = (comp as Record<string, unknown>).anatomy;
        if (!Array.isArray(anatomy) || anatomy.length < 2) {
          badAnatomyCount++;
        }
        // Validate type exists
        if (!anatomy && !(comp as Record<string, unknown>).type) {
          badAnatomyCount++;
        }
      }
    }
    if (badAnatomyCount > 0) {
      consistencyDeductions.push(Math.min(20, badAnatomyCount * 5));
      issues.push(`${badAnatomyCount} component(s) missing proper anatomy or type`);
    }
  }

  // Cross-field: if motion.types is empty, motion.duration and motion.easing should be null
  if (motion && Array.isArray(motion.types) && motion.types.length === 0) {
    if (motion.duration !== null && motion.duration !== undefined) {
      issues.push("motion has duration but no types — inconsistent");
      consistencyDeductions.push(5);
    }
  }

  consistencyScore = Math.max(0, 100 - consistencyDeductions.reduce((a, b) => a + b, 0));

  // ── 3. SPECIFICITY (0-100) ──────────────────────────────────────

  let specificityScore = 50; // baseline
  const specificPatterns = [
    /py-\d+|px-\d+|p-\d+|m-\d+|gap-\d+|rounded-\w+|shadow-\w+|w-\d+|max-w-\w+|grid-cols-\d+/, // Tailwind classes
    /\d+px|\d+rem|\d+em|\d+vh|\d+vw/, // CSS values
    /clamp\(/, // Responsive clamp
    /cubic-bezier\(/, // Specific easing
    /@[^\s]+\s+/, // @font-face, @keyframes
    /#[0-9a-fA-F]{3,8}/, // Hex colors
    /rgb|hsl/, // Color functions
    /var\(--/, // CSS custom properties
  ];

  const allDnaValues = JSON.stringify(dna);
  for (const pattern of specificPatterns) {
    const matches = allDnaValues.match(pattern);
    if (matches) {
      specificityScore = Math.min(100, specificityScore + 8);
    }
  }

  // Penalize generic descriptions
  const genericWords = [
    "bom spacing", "boa tipografia", "clean design", "nice colors",
    "moderno", "elegante", "profissional", "clean", "nice", "good",
    "padrão", "default", "normal", "comum", "usual", "típico",
  ];
  for (const word of genericWords) {
    const regex = new RegExp(word, "gi");
    const matches = allDnaValues.match(regex);
    if (matches && matches.length > 2) {
      specificityScore = Math.max(0, specificityScore - 5);
    }
  }

  // ── 4. ACTIONABILITY (0-100) ──────────────────────────────────────

  const actionabilityScore = Math.round(
    (specificityScore * 0.4) + (completeness * 0.3) + (consistencyScore * 0.3),
  );

  // ── 5. OVERALL SCORE ─────────────────────────────────────────────

  const score = Math.round(
    (completeness * 0.25) +
    (consistencyScore * 0.25) +
    (specificityScore * 0.25) +
    (actionabilityScore * 0.25),
  );

  // ── 6. QUALITY_SCORE CALIBRATION ───────────────────────────────

  // Override the DNA's quality_score with validator-calibrated score
  const calibratedQualityScore = Math.round(score / 10 * 10) / 10; // 0-10
  const existingScore = Number(dna.quality_score ?? 5);
  if (Math.abs(calibratedQualityScore - existingScore) > 1) {
    dna.quality_score = calibratedQualityScore;
    autoFixes.push(`Calibrated quality_score: ${existingScore} → ${calibratedQualityScore}/10`);
    fixed = true;
  }

  // ── 7. REJECT VERDICT ──────────────────────────────────────────

  const reject = score < 40;

  return {
    validation: {
      score,
      completeness,
      consistency: consistencyScore,
      specificity: specificityScore,
      actionability: actionabilityScore,
      issues,
      autoFixes,
    },
    reject,
    fixed,
    dna,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

const genericDurationPhrases = [
  "fast", "slow", "medium", "normal", "padrão", "default", "suave", "smooth",
  "rápido", "lento", "moderado", "typical", "normal",
];
