import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateDesignUniqueness, formatUniquenessFeedback } from "./design-uniqueness.ts";
import type { DesignPlanField } from "./types.ts";
import type { DesignSignatureRecord } from "./design-plan-field.ts";

const CURRENT_DESIGN: DesignPlanField = {
  voice: ["high-tech", "swiss"],
  mood: "ocean",
  techniques: ["spotlight-cursor", "animated-mesh-background", "scroll-reveal"],
  moment: "Hero cinematic com spotlight",
  compositions: ["hero-cinematic-spotlight", "bento-dense-showcase", "glass-nav-floating"],
  composition_exports: ["HeroCinematicSpotlight", "BentoDenseShowcase", "GlassNavFloating"],
  read_paths: [],
  anti_patterns: [],
  synthesis_reasoning: "test",
};

const PREVIOUS_SAME_VOICE: DesignSignatureRecord = {
  voice: ["high-tech", "swiss"],
  mood: "ocean",
  techniques: ["spotlight-cursor", "animated-mesh-background"],
  moment: "Hero cinematic",
  compositions: ["hero-cinematic-spotlight", "bento-dense-showcase"],
  updated_at: "2026-01-01T00:00:00Z",
};

const PREVIOUS_DIFFERENT: DesignSignatureRecord = {
  voice: ["brutalist", "editorial"],
  mood: "sand",
  techniques: ["grain-texture-overlay", "parallax-depth"],
  moment: "Hero editorial com grain",
  compositions: ["hero-editorial-split", "faq-accordion-craft"],
  updated_at: "2026-01-01T00:00:00Z",
};

Deno.test("evaluateDesignUniqueness — sem histórico retorna score 1 (pass)", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, []);
  assertEquals(result.pass, true);
  assertEquals(result.score, 1);
  assert(result.evidence.unique_dimensions.length === 4);
});

Deno.test("evaluateDesignUniqueness — design similar a histórico retorna score baixo", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_SAME_VOICE]);
  // Deve detectar sobreposição de voice, mood, techniques, compositions
  assert(result.score < 0.6, `Score ${(result.score * 100).toFixed(0)}% deveria ser baixo`);
  assert(result.evidence.overlapping_dimensions.includes("voice"));
  assert(result.evidence.overlapping_dimensions.includes("mood"));
});

Deno.test("evaluateDesignUniqueness — design diferente de histórico retorna score alto", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_DIFFERENT]);
  assert(result.pass, "Design diferente deveria passar");
  assert(result.score >= 0.6, `Score ${(result.score * 100).toFixed(0)}% deveria ser >= 60%`);
});

Deno.test("evaluateDesignUniqueness — múltiplos históricos considera o mais similar", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_DIFFERENT, PREVIOUS_SAME_VOICE]);
  const similarities = result.evidence.similarities;
  assertEquals(similarities.length, 2);
  const maxSimilarity = Math.max(...similarities.map((s) => s.score));
  // O score de unicidade = 1 - maxSimilarity
  assert(result.score <= 1 - maxSimilarity + 0.01, "Score de unicidade deve refletir o mais similar");
});

Deno.test("evaluateDesignUniqueness — gera rotation_suggestions quando similar", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_SAME_VOICE]);
  if (!result.pass) {
    assert(result.rotation_suggestions.length > 0, "Deveria sugerir rotação");
  }
});

Deno.test("evaluateDesignUniqueness — threshold customizável", () => {
  // PREVIOUS_SAME_VOICE tem score de similaridade alto → uniqueness baixo (~0.2)
  // PREVIOUS_DIFFERENT tem score de similaridade baixo → uniqueness alto (~1.0)
  const result_similar = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_SAME_VOICE], 0.5);
  const result_veryStrict = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_SAME_VOICE], 0.99);
  // Ambos falham porque o design é similar
  assertEquals(result_similar.pass, false, "Threshold 0.5 com design similar falha");
  assertEquals(result_veryStrict.pass, false, "Threshold 0.99 com design similar falha");
  // Mas o score NÃO muda com threshold
  assertEquals(result_similar.score, result_veryStrict.score);
});

Deno.test("evaluateDesignUniqueness — formato do resultado consistente", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_SAME_VOICE]);
  assert(typeof result.score === "number");
  assert(result.score >= 0 && result.score <= 1);
  assert(Array.isArray(result.evidence.similarities));
  assert(Array.isArray(result.evidence.overlapping_dimensions));
  assert(Array.isArray(result.evidence.unique_dimensions));
  assert(Array.isArray(result.rotation_suggestions));
  assert(Array.isArray(result.telemetry));
});

Deno.test("formatUniquenessFeedback — resultado pass produz feedback positivo", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, []);
  const feedback = formatUniquenessFeedback(result);
  assert(feedback.includes("OK"), `Feedback: ${feedback.slice(0, 100)}`);
});

Deno.test("formatUniquenessFeedback — resultado fail produz feedback acionável", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_SAME_VOICE]);
  const feedback = formatUniquenessFeedback(result);
  assert(feedback.includes("BAIXA"), `Feedback: ${feedback.slice(0, 100)}`);
  assert(feedback.includes("→") || feedback.includes("Sugestões"),
    "Feedback deveria conter sugestões de rotação");
});

Deno.test("evaluateDesignUniqueness — detecta sobreposição de compositions", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, [PREVIOUS_SAME_VOICE]);
  assert(result.evidence.overlapping_dimensions.includes("compositions") ||
    result.evidence.overlapping_dimensions.includes("techniques"));
});

Deno.test("evaluateDesignUniqueness — history vazio retorna telemetry ok", () => {
  const result = evaluateDesignUniqueness(CURRENT_DESIGN, []);
  assertEquals(result.telemetry.length, 1);
  assertEquals(result.telemetry[0].ok, true);
  assertEquals(result.telemetry[0].kind, "design_uniqueness");
});
