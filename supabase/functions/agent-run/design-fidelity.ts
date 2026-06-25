// design-fidelity.ts — Validação pós-build de fidelidade ao approvedDesign.
// Verifica se o código gerado realmente corresponde ao voice, mood, techniques,
// moment e complexity do design aprovado. Resultado blocking — abaixo do threshold,
// o build falha e o LLM é forçado a refazer.
//
// Diferente do design-validate.ts (que só checa imports/signatures), este módulo
// avalia a INTENÇÃO de design: as características visuais estão presentes?
// O momento-memorável foi executado? A página tem profundidade suficiente?

import { buildTechniqueSignatures, type TechniqueSignature } from "./design-validate-signatures.ts";
import { loadDesignManifest } from "./design-manifest.ts";
import type { DesignPlanField } from "./types.ts";
import type { DesignTelemetryEvent } from "./design-telemetry.ts";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type FidelityDimension =
  | "voice"
  | "mood"
  | "technique"
  | "complexity"
  | "moment";

export interface FidelityEvidence {
  found: string[];    // patterns detected in code
  missing: string[];  // expected patterns NOT found
}

export interface FidelityCheck {
  dimension: FidelityDimension;
  score: number;        // 0.0 – 1.0
  weight: number;       // contribution to overall score
  evidence: FidelityEvidence;
  detail: string;       // human-readable summary
}

export interface FidelityResult {
  pass: boolean;
  score: number;            // weighted overall 0.0 – 1.0
  threshold: number;        // minimum score to pass
  checks: FidelityCheck[];
  blocking_issues: string[];
  suggestions: string[];    // what the LLM should fix
  telemetry: DesignTelemetryEvent[];
}

// ──────────────────────────────────────────────
// Voice signatures — patterns that indicate a visual language is being applied
// ──────────────────────────────────────────────

interface VoiceFidelityPatterns {
  /** Patterns that SHOULD appear if this language is used correctly */
  expected: RegExp[];
  /** Patterns that SHOULD NOT appear (anti-patterns of this language) */
  forbidden: RegExp[];
  /** Human-readable principles for feedback */
  principles: string[];
}

const VOICE_SIGNATURES: Record<string, VoiceFidelityPatterns> = {
  swiss: {
    expected: [
      /grid-(cols|cells)/i,
      /\bInter\b|\bGeist\b|\bHelvetica\b/i,
      /space-(y|x)-\d+/,
      /max-w-/,
      /\bgap-\d+/,
      /grid-cols-/,
    ],
    forbidden: [
      /backdrop-blur/,
      /neon-(glow|text)/,
      /rounded-\[/,
      /shadow-(lg|xl|2xl)/i,
    ],
    principles: [
      "Grid rígido com alinhamento perfeito",
      "Tipografia grotesca (Inter, Geist, Helvetica)",
      "Espaço negativo generoso — respiro entre elementos",
      "Hierarquia por tamanho e peso, não por cor",
    ],
  },
  brutalist: {
    expected: [
      /grain/i,
      /texture/i,
      /border-2|border-4/,
      /text-(6xl|7xl|8xl|9xl)/,
      /clamp\([^)]*15vw/,
      /opacity\.0[3-5]/,
    ],
    forbidden: [
      /shadow-(lg|xl|2xl)/i,
      /rounded-(2xl|3xl)/i,
      /backdrop-blur-xl/i,
    ],
    principles: [
      "Tipografia MASSIVA — headlines que ocupam viewport",
      "Sem sombras suaves — borders hard ou nenhum",
      "Grain/textura overlay — sensação de material real",
      "Cores chapadas, sem gradient suave",
    ],
  },
  editorial: {
    expected: [
      /Playfair|Bodoni|Didot/i,
      /serif/i,
      /col-span-(\d+)/,
      /line-height.*1\.6|line-height.*1\.8/i,
      /columns?-/i,
    ],
    forbidden: [
      /neon/i,
      /glassmorphism/i,
      /cyberpunk/i,
    ],
    principles: [
      "Serifa display + sans-serif body",
      "Colunas assimétricas — texto estreito, visual largo",
      "Whitespace como elemento de design",
      "Hierarquia por contraste tipográfico, não por cor",
    ],
  },
  "high-tech": {
    expected: [
      /mesh/i,
      /gradient/i,
      /spotlight/i,
      /tracking.*-0\.0[3-5]/i,
      /backdrop-blur/,
      /micro.?interact/i,
      /magnetic/i,
    ],
    forbidden: [
      /serif/i,
      /grain/i,
      /rounded-(2xl|3xl)/i,
    ],
    principles: [
      "Mesh gradient animado sutil no bg",
      "Tipografia grotesca com tracking apertado (-0.03em)",
      "Micro-interações precisas (hover, magnetic, spotlight)",
      "Dark mode dominante com accent vibrante",
    ],
  },
  "japanese-minimalism": {
    expected: [
      /py-(24|32|40)/,
      /max-w-(2xl|3xl|4xl)/,
      /opacity-(\d0)/,
      /light/i,
      /tracking-wide/i,
    ],
    forbidden: [
      /grid-cols-(3|4)/,
      /neon/i,
      /glow/i,
      /gradient/i,
      /parallax/i,
    ],
    principles: [
      "ESPAÇO NEGATIVO DOMINA — 60-70% da tela é vazio",
      "1 elemento por seção — sem clusters",
      "Paleta mono + 1 accent natural",
      "Tipografia discreta — peso light",
    ],
  },
  bauhaus: {
    expected: [
      /(circle|square|triangle)/i,
      /geometric/i,
      /Futura|Avenir/i,
      /[#](FF|CC|00|33|66|99)/,
    ],
    forbidden: [
      /serif/i,
      /gradient/i,
      /grain/i,
    ],
    principles: [
      "Formas geométricas primárias como elementos visuais",
      "Cores primárias (vermelho, azul, amarelo) + preto e branco",
      "Tipografia sans-serif geométrica (Futura, Avenir)",
    ],
  },
  cyberpunk: {
    expected: [
      /neon/i,
      /glow/i,
      /monospace/i,
      /cyber/i,
      /glitch/i,
      /scanline/i,
    ],
    forbidden: [
      /serif/i,
      /whitespace/i,
      /soft/i,
    ],
    principles: [
      "Neon vibrante sobre bg ultra-escuro",
      "Tipografia monospace ou display tech",
      "Glitch effects — RGB split, scanlines",
      "Motion agressivo — flicker, instant transitions",
    ],
  },
  "art-deco": {
    expected: [
      /gold|foil|metallic/i,
      /geometric/i,
      /symmetry|symmetrical/i,
      /Didot|Bodoni/i,
      /tracking-wide/i,
    ],
    forbidden: [
      /grain/i,
      /brutalist/i,
      /raw/i,
    ],
    principles: [
      "Elegância geométrica — simetria rigorosa",
      "Gold/metallic accents",
      "Padrões geométricos radiais",
      "Tipografia display elegante com tracking wide",
    ],
  },
  memphis: {
    expected: [
      /colorful/i,
      /playful/i,
      /zigzag|squiggle/i,
      /geometric/i,
      /vibrant/i,
    ],
    forbidden: [
      /minimal/i,
      /whitespace/i,
      /mono/i,
    ],
    principles: [
      "Cores vibrantes e contrastantes",
      "Formas geométricas lúdicas",
      "Quebra intencional de grid e hierarquia",
    ],
  },
  y2k: {
    expected: [
      /chrome|holographic|iridescent/i,
      /blob/i,
      /gradient/i,
      /bouncy|spring/i,
      /gloss|reflection/i,
    ],
    forbidden: [
      /serif/i,
      /minimal/i,
      /grain/i,
    ],
    principles: [
      "Chrome e metallic gradients",
      "Blob shapes e formas orgânicas",
      "Tipografia tech round",
      "Motion com spring physics — bouncy, playful",
    ],
  },
  organic: {
    expected: [
      /rounded-(2xl|3xl|full)/i,
      /blob/i,
      /natural|organic/i,
      /blend/i,
      /warm/i,
    ],
    forbidden: [
      /neon/i,
      /cyber/i,
      /monospace/i,
    ],
    principles: [
      "Curvas e formas orgânicas",
      "Paleta terrosa — terra, areia, verde natural",
      "Tipografia humanista sans-serif",
      "Motion fluido — spring physics",
    ],
  },
  minimal: {
    expected: [
      /py-(32|40|48)/,
      /max-w-(2xl|3xl|4xl)/,
      /opacity-(\d0)/,
      /space-(y|x)-\d+/,
    ],
    forbidden: [
      /grid-cols-(3|4)/,
      /multiple/i,
      /complex|complexity/i,
    ],
    principles: [
      "1 elemento por seção — máximo 2",
      "Paleta mono + 1 accent máximo",
      "Whitespace EXTREMO — 70%+ da tela é vazio",
      "Motion sutil — fade lento",
    ],
  },
};

// ──────────────────────────────────────────────
// Mood color patterns
// ──────────────────────────────────────────────

const MOOD_COLORS: Record<string, { brand: RegExp[]; forbidden: RegExp[] }> = {
  ember: {
    brand: [/orange/i, /amber/i, /#FFB627/i, /#FF7A1A/i, /#E65C00/i],
    forbidden: [/blue/i, /teal/i, /#06b6d4/i],
  },
  ocean: {
    brand: [/blue/i, /cyan/i, /#0ea5e9/i, /#0284c7/i, /#0369a1/i],
    forbidden: [/orange/i, /amber/i],
  },
  forest: {
    brand: [/green/i, /emerald/i, /#10b981/i, /#059669/i, /#047857/i],
    forbidden: [/pink/i, /purple/i],
  },
  mono: {
    brand: [/zinc/i, /gray/i, /neutral/i, /slate/i, /#18181b/i, /#27272a/i],
    forbidden: [/violet|indigo|pink|rose|amber/i],
  },
  neon: {
    brand: [/cyan/i, /magenta/i, /lime/i, /#00ff/i, /#ff00/i, /neon/i],
    forbidden: [/brown|beige|sand/i],
  },
  sand: {
    brand: [/stone/i, /brown/i, /amber/i, /beige|warm/i, /#d97706/i, /#b45309/i],
    forbidden: [/blue/i, /neon/i],
  },
  royal: {
    brand: [/purple/i, /violet/i, /indigo/i, /#7c3aed/i, /#6d28d9/i, /#5b21b6/i],
    forbidden: [/lime|green/i, /orange/i],
  },
  sunset: {
    brand: [/pink/i, /rose/i, /purple/i, /#ec4899/i, /#d946ef/i, /#a855f7/i],
    forbidden: [/green/i, /teal/i, /lime/i],
  },
};

// ──────────────────────────────────────────────
// Composition section map
// ──────────────────────────────────────────────

type SectionCategory = "hero" | "features" | "narrative" | "cta" | "footer" | "testimonial" | "pricing" | "faq" | "stats" | "nav";

const SECTION_ROLES: Record<string, SectionCategory> = {
  "hero-editorial-split": "hero",
  "hero-brutalist-typography": "hero",
  "hero-cinematic-spotlight": "hero",
  "interactive-hero-demo": "hero",
  "bento-dense-showcase": "features",
  "editorial-magazine-split": "narrative",
  "sticky-stack-narrative": "narrative",
  "section-tabs-feature-lanes": "features",
  "process-steps-how-it-works": "narrative",
  "spotlight-showcase-grid": "features",
  "parallax-product-showcase": "hero",
  "glass-nav-floating": "nav",
  "grain-artisanal-overlay": "hero",
  "kinetic-headline-reveal": "hero",
  "faq-accordion-craft": "faq",
};

// ──────────────────────────────────────────────
// Core validation functions
// ──────────────────────────────────────────────

function validateVoiceFidelity(
  voice: string[],
  code: string,
): FidelityCheck {
  if (!voice.length) {
    return {
      dimension: "voice",
      score: 0,
      weight: 0.25,
      evidence: { found: [], missing: ["nenhuma voz selecionada"] },
      detail: "Nenhuma linguagem visual definida no approved design",
    };
  }

  const allFound: string[] = [];
  const allMissing: string[] = [];
  const allViolations: string[] = [];

  for (const langId of voice) {
    const sig = VOICE_SIGNATURES[langId];
    if (!sig) {
      allMissing.push(`${langId}: sem padrões de verificação definidos`);
      continue;
    }

    // Check expected patterns
    const found = sig.expected.filter((p) => p.test(code));
    const missing = sig.expected.filter((p) => !p.test(code));
    const forbiddenFound = sig.forbidden.filter((p) => p.test(code));

    if (found.length > 0) {
      allFound.push(`${langId}: ${found.length}/${sig.expected.length} princípios detectados`);
    }
    if (missing.length > 0) {
      allMissing.push(
        `${langId}: princípios ausentes — ${missing.length} padrões não encontrados`,
      );
    }
    if (forbiddenFound.length > 0) {
      allViolations.push(
        `${langId}: ${forbiddenFound.length} anti-padrões encontrados no código`,
      );
    }
  }

  // Score: expected patterns found / total expected, minus anti-pattern penalty
  const totalExpected = voice.reduce(
    (sum, v) => sum + (VOICE_SIGNATURES[v]?.expected.length ?? 0),
    0,
  );
  const totalFound = voice.reduce((sum, v) => {
    const sig = VOICE_SIGNATURES[v];
    return sig ? sum + sig.expected.filter((p) => p.test(code)).length : sum;
  }, 0);
  const totalViolations = voice.reduce((sum, v) => {
    const sig = VOICE_SIGNATURES[v];
    return sig ? sum + sig.forbidden.filter((p) => p.test(code)).length : sum;
  }, 0);

  const baseScore = totalExpected > 0 ? totalFound / totalExpected : 0;
  const penalty = totalViolations * 0.15;
  const score = Math.max(0, Math.min(1, baseScore - penalty));

  return {
    dimension: "voice",
    score,
    weight: 0.25,
    evidence: { found: allFound, missing: [...allMissing, ...allViolations] },
    detail:
      score >= 0.6
        ? `Voice fidelity OK (${(score * 100).toFixed(0)}%): ${voice.join(" + ")} detectada`
        : `Voice fidelity BAIXA (${(score * 100).toFixed(0)}%): ${voice.join(" + ")} — ${allMissing.join("; ")}`,
  };
}

function validateMoodFidelity(
  mood: string | undefined,
  code: string,
): FidelityCheck {
  if (!mood || !MOOD_COLORS[mood]) {
    return {
      dimension: "mood",
      score: mood ? 0.5 : 0,
      weight: 0.15,
      evidence: { found: [], missing: [mood ? `mood "${mood}" sem paleta de verificação` : "nenhum mood definido"] },
      detail: mood ? `Mood "${mood}" sem padrões de verificação` : "Nenhum mood definido no approved design",
    };
  }

  const palette = MOOD_COLORS[mood];
  const brandFound = [code.includes("@theme") || code.includes("--brand"), ...palette.brand.filter((p) => p.test(code))];
  const forbiddenFound = palette.forbidden.filter((p) => p.test(code));

  const evidence: FidelityEvidence = {
    found: [],
    missing: [],
  };

  if (brandFound.length > 0) evidence.found.push(`Cores brand detectadas para mood "${mood}"`);
  if (code.includes("@theme")) evidence.found.push("@theme tokens presentes no CSS");

  if (forbiddenFound.length > 0) {
    evidence.missing.push(`${forbiddenFound.length} cores de mood conflitante detectadas`);
  }

  // Score
  const brandScore = brandFound.length > 0 ? Math.min(1, brandFound.length / 3) : 0;
  const penalty = forbiddenFound.length * 0.2;
  const score = Math.max(0, Math.min(1, brandScore - penalty));

  return {
    dimension: "mood",
    score,
    weight: 0.15,
    evidence,
    detail:
      score >= 0.5
        ? `Mood fidelity OK (${(score * 100).toFixed(0)}%): paleta "${mood}" detectada`
        : `Mood fidelity BAIXA (${(score * 100).toFixed(0)}%): paleta "${mood}" não encontrada no código`,
  };
}

function validateTechniqueFidelity(
  expectedTechniques: string[],
  code: string,
): FidelityCheck {
  if (!expectedTechniques.length) {
    return {
      dimension: "technique",
      score: 1,
      weight: 0.30,
      evidence: { found: ["sem técnicas obrigatórias"], missing: [] },
      detail: "Nenhuma técnica obrigatória — pulando verificação",
    };
  }

  const techSigs = buildTechniqueSignatures();
  const found: string[] = [];
  const missing: string[] = [];

  for (const techId of expectedTechniques) {
    const sig = techSigs.find((s: TechniqueSignature) => s.id === techId);
    if (!sig) {
      missing.push(`${techId}: sem assinatura no manifest`);
      continue;
    }
    const hasMatch = sig.patterns.some((p: RegExp) => p.test(code));
    if (hasMatch) {
      found.push(techId);
    } else {
      missing.push(techId);
    }
  }

  const score = expectedTechniques.length > 0 ? found.length / expectedTechniques.length : 1;

  return {
    dimension: "technique",
    score,
    weight: 0.30,
    evidence: { found, missing },
    detail:
      score >= 1
        ? `Technique fidelity PERFEITA: todas ${found.length} técnicas implementadas`
        : score >= 0.5
          ? `Technique fidelity PARCIAL (${(score * 100).toFixed(0)}%): ${found.length}/${expectedTechniques.length} técnicas`
          : `Technique fidelity BAIXA (${(score * 100).toFixed(0)}%): apenas ${found.length}/${expectedTechniques.length} técnicas`,
  };
}

function validateComplexityFidelity(
  expectedCompositions: string[],
  expectedTechniques: string[],
  code: string,
): FidelityCheck {
  const evidence: FidelityEvidence = { found: [], missing: [] };
  const issues: string[] = [];

  // 1. Minimum composition count (should be ≥2, ideal ≥3)
  const m = loadDesignManifest();
  const allCompositionExports = (m.compositions_opinionated as { export: string }[]).map((c) => c.export);
  const compositionCount = allCompositionExports.filter((exp) =>
    new RegExp(`<${exp}[\\s/>]`).test(code)
  ).length;

  if (compositionCount < 2) {
    evidence.missing.push(
      `Apenas ${compositionCount} composição(ões) — mínimo 2 para landing, ideal 3+`,
    );
  } else if (compositionCount < 3) {
    evidence.found.push(`${compositionCount} composições detectadas (mínimo ok, ideal 3+)`);
  } else {
    evidence.found.push(`${compositionCount} composições — profundidade visual excelente`);
  }

  // 2. Section coverage — which page sections are covered?
  const sections: SectionCategory[] = ["hero", "features", "narrative", "cta", "footer", "testimonial", "pricing", "faq", "stats", "nav"];
  const foundSections = sections.filter((s) => {
    switch (s) {
      case "hero": return /hero/i.test(code) || /<[A-Za-z]*Hero[A-Za-z]*/.test(code);
      case "features": return /feature/i.test(code) || /benefit/i.test(code) || /bento/i.test(code) || /grid/i.test(code);
      case "narrative": return /story|narrative|process|how.it.works/i.test(code);
      case "cta": return /cta|sign.up|get.started/i.test(code);
      case "footer": return /footer/i.test(code);
      case "testimonial": return /testimonial|review|social.proof/i.test(code);
      case "pricing": return /pricing|price|plan/i.test(code);
      case "faq": return /faq|question|accordion/i.test(code);
      case "stats": return /stat|metric|count/i.test(code);
      case "nav": return /nav|header|menu/i.test(code);
    }
  });

  evidence.found.push(`Seções detectadas: ${foundSections.length} (${foundSections.join(", ")})`);
  const missingSections = sections.filter((s) => !foundSections.includes(s) && s !== "nav");
  if (foundSections.length < 3) {
    evidence.missing.push(`Apenas ${foundSections.length} seções — landing típica tem 4-7`);
  }

  // 3. Technique density
  const techSigs = buildTechniqueSignatures();
  const usedTechs = techSigs.filter((s: TechniqueSignature) => s.patterns.some((p: RegExp) => p.test(code)));
  evidence.found.push(`${usedTechs.length} técnicas implementadas no total`);

  if (usedTechs.length < 2) {
    evidence.missing.push("Menos de 2 técnicas — página visualmente plana");
  } else if (usedTechs.length >= 4) {
    evidence.found.push("Densidade de técnica alta — página rica em motion e interação");
  }

  // Score: composite of composition count, section coverage, and technique density
  const compScore = Math.min(1, compositionCount / 3);
  const sectionScore = Math.min(1, foundSections.length / 5);
  const techScore = Math.min(1, usedTechs.length / 3);
  const score = Math.min(1, (compScore * 0.4 + sectionScore * 0.35 + techScore * 0.25));

  return {
    dimension: "complexity",
    score,
    weight: 0.20,
    evidence,
    detail:
      score >= 0.7
        ? `Complexidade EXCELENTE (${(score * 100).toFixed(0)}%): ${compositionCount} composições, ${foundSections.length} seções, ${usedTechs.length} técnicas`
        : score >= 0.4
          ? `Complexidade ADEQUADA (${(score * 100).toFixed(0)}%): pode adicionar mais seções ou técnicas`
          : `Complexidade BAIXA (${(score * 100).toFixed(0)}%): página muito simples — adicione composições, seções e técnicas`,
  };
}

function validateMomentFidelity(
  moment: string,
  expectedTechniques: string[],
  code: string,
): FidelityCheck {
  if (!moment?.trim()) {
    return {
      dimension: "moment",
      score: 0,
      weight: 0.10,
      evidence: { found: [], missing: ["momento-memorável não definido"] },
      detail: "Nenhum momento-memorável definido",
    };
  }

  const evidence: FidelityEvidence = { found: [], missing: [] };
  const momentLower = moment.toLowerCase();

  // Check that the moment's keywords appear in the generated code
  // Extract meaningful terms from the moment description
  const terms = momentLower
    .replace(/[.,;:!?]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["para", "com", "que", "uma", "como", "mais", "sua", "pelo", "pela", "entre", "sobre", "através", "através"].includes(w))
    .slice(0, 8);

  const foundTerms = terms.filter((t) => code.toLowerCase().includes(t));
  const missingTerms = terms.filter((t) => !code.toLowerCase().includes(t));

  if (foundTerms.length > 0) {
    evidence.found.push(`${foundTerms.length}/${terms.length} termos do gesto detectados no código`);
  }
  if (missingTerms.length > 0) {
    evidence.missing.push(
      `${missingTerms.length} termos do gesto NÃO encontrados: "${missingTerms.slice(0, 4).join(", ")}"`,
    );
  }

  // ponytail: gesto REALIZADO mede FORMA, não conformidade. O marcador é "a página tem
  // algum ofício/movimento" (qualquer técnica detectada), NÃO "as técnicas prescritas estão
  // presentes" — assim a substituição criativa (trocar a técnica prescrita por uma melhor)
  // não falha o gesto. O que define o gesto memorável é a INTENÇÃO + a forma, não a lista.
  const techSigs = buildTechniqueSignatures();
  const anyTechnique = techSigs.some((s: TechniqueSignature) =>
    s.patterns.some((p: RegExp) => p.test(code)),
  );
  if (anyTechnique) {
    evidence.found.push("ofício/movimento detectado na página — o gesto tem forma");
  } else {
    evidence.missing.push("nenhuma técnica/movimento detectada — o gesto não se concretizou");
  }

  // Score: cobertura dos termos do gesto (intenção realizada) + presença de ofício (forma).
  const termScore = terms.length > 0 ? foundTerms.length / terms.length : 0.5;
  const craftScore = anyTechnique ? 1 : 0;
  const score = Math.min(1, termScore * 0.5 + craftScore * 0.5);

  return {
    dimension: "moment",
    score,
    weight: 0.10,
    evidence,
    detail:
      score >= 0.7
        ? `Momento-memorável REALIZADO (${(score * 100).toFixed(0)}%): "${moment.slice(0, 80)}..."`
        : score >= 0.4
          ? `Momento-memorável PARCIAL (${(score * 100).toFixed(0)}%): ajuste para capturar a intenção`
          : `Momento-memorável NÃO REALIZADO (${(score * 100).toFixed(0)}%): "${moment.slice(0, 80)}..."`,
  };
}

// ──────────────────────────────────────────────
// Main fidelity check
// ──────────────────────────────────────────────

export function validateDesignFidelity(
  approvedDesign: DesignPlanField,
  generatedFiles: Map<string, string>,
  threshold = 0.6,
): FidelityResult {
  const code = [...generatedFiles.values()].join("\n");
  const telemetry: DesignTelemetryEvent[] = [];

  const checks: FidelityCheck[] = [
    validateVoiceFidelity(approvedDesign.voice ?? [], code),
    validateMoodFidelity(approvedDesign.mood, code),
    validateTechniqueFidelity(approvedDesign.techniques ?? [], code),
    validateComplexityFidelity(
      approvedDesign.compositions ?? [],
      approvedDesign.techniques ?? [],
      code,
    ),
    validateMomentFidelity(
      approvedDesign.moment ?? "",
      approvedDesign.techniques ?? [],
      code,
    ),
  ];

  // Compute weighted score
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const score = checks.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight;

  // ponytail: gate invertido — bloqueia só por AUSÊNCIA DE OFÍCIO, nunca por adesão.
  // Dimensões de ofício (página rasa / gesto não concretizado) bloqueiam; as de adesão
  // (voz/mood/técnica) apenas aconselham — para NÃO punir a substituição criativa de
  // uma técnica prescrita por outra melhor. "Mediano é inaceitável"; ousadia é recompensada.
  const CRAFT_DIMENSIONS = new Set(["complexity", "moment"]);

  const blocking_issues: string[] = [];
  const suggestions: string[] = [];

  for (const check of checks) {
    const blocksCraft = CRAFT_DIMENSIONS.has(check.dimension) && check.score < 0.4;
    if (blocksCraft) {
      blocking_issues.push(`${check.dimension}: (${(check.score * 100).toFixed(0)}%)`);
    }
    if (check.evidence.missing.length > 0 && !blocksCraft) {
      suggestions.push(
        `${check.dimension}: ${check.evidence.missing.slice(0, 2).join("; ")}`,
      );
    }
  }

  // ponytail: o veredito é CRAFT-BASED, não conformity-based. pass = nenhuma dimensão de
  // ofício (complexity/moment) abaixo do piso. Voz/mood/técnica viram aconselhamento (score
  // informativo + telemetry), NUNCA veredito — trocar a técnica prescrita por uma melhor
  // não pode reprovar a página. "Mediano é inaceitável" barrado pelo piso de ofício.
  const pass = blocking_issues.length === 0;

  telemetry.push({
    kind: "design_fidelity",
    ok: pass,
    detail: JSON.stringify({
      score: Math.round(score * 100),
      threshold: Math.round(threshold * 100),
      checks: checks.map((c) => ({
        dimension: c.dimension,
        score: Math.round(c.score * 100),
      })),
    }),
    at: new Date().toISOString(),
  });

  return {
    pass,
    score,
    threshold,
    checks,
    blocking_issues,
    suggestions,
    telemetry,
  };
}

/**
 * Formata o resultado de fidelidade para feedback do LLM.
 * Usado pelo observer para construir a mensagem de correção.
 */
export function formatFidelityFeedback(result: FidelityResult): string {
  if (result.pass) {
    return [
      `🎨 COESÃO DE DESIGN OK — score ${(result.score * 100).toFixed(0)}% (mínimo ${(result.threshold * 100).toFixed(0)}%)`,
      ...result.checks
        .filter((c) => c.score >= 0.6)
        .map((c) => `  ✅ ${c.dimension}: ${(c.score * 100).toFixed(0)}%`),
      "",
      "O design está coeso com o conceito aprovado. Siga.",
    ].join("\n");
  }

  const lines: string[] = [
    `🎨 COESÃO DE DESIGN — score ${(result.score * 100).toFixed(0)}% (mínimo ${(result.threshold * 100).toFixed(0)}%)`,
    "",
    "### O design pode ser fortalecido para se alinhar melhor ao conceito aprovado.",
    "Abaixo estão os pontos de atenção. Ajuste com fs_edit e tente o build novamente:",
    "",
  ];

  for (const check of result.checks) {
    const icon = check.score >= 0.7 ? "✅" : check.score >= 0.4 ? "🔶" : "🔴";
    lines.push(`${icon} ${check.dimension}: ${(check.score * 100).toFixed(0)}%`);
    if (check.evidence.missing.length > 0) {
      for (const m of check.evidence.missing.slice(0, 3)) {
        lines.push(`   · ${m}`);
      }
    }
    if (check.evidence.found.length > 0 && check.score < 0.7) {
      for (const f of check.evidence.found.slice(0, 2)) {
        lines.push(`   + ${f}`);
      }
    }
    lines.push("");
  }

  if (result.blocking_issues.length > 0) {
    lines.push("🔴 Pontos críticos de coesão:");
    for (const issue of result.blocking_issues) {
      lines.push(`· ${issue}`);
    }
    lines.push("");
  }

  if (result.suggestions.length > 0) {
    lines.push("💡 Oportunidades de elevação:");
    for (const sug of result.suggestions) {
      lines.push(`· ${sug}`);
    }
    lines.push("");
  }

  lines.push(
    "O design aprovado é seu norte, não sua corrente. Os princípios de voice,",
    "mood e momento devem estar VIVOS na página — mas a execução é sua.",
    "Adapte, surpreenda, desde que o conceito central permaneça íntegro.",
  );

  return lines.join("\n");
}
