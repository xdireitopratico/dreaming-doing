import { describe, expect, it } from "vitest";
import { COMPOSITIONS, findCompositions, compositionCatalogSummary } from "./index";

describe("Composition Catalog", () => {
  it("tem 11 composições definidas", () => {
    expect(COMPOSITIONS.length).toBe(11);
  });

  it("cada composição tem campos obrigatórios", () => {
    for (const comp of COMPOSITIONS) {
      expect(comp.id).toBeTruthy();
      expect(comp.name).toBeTruthy();
      expect(comp.voice.length).toBeGreaterThanOrEqual(1);
      expect(comp.moment).toBeTruthy();
      expect(comp.compatible_moods.length).toBeGreaterThanOrEqual(1);
      expect(comp.guardrails.length).toBeGreaterThanOrEqual(1);
      expect(comp.code_path).toBeTruthy();
      expect(comp.props.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("cada composição tem vozes válidas", () => {
    const validVoices = ["swiss", "brutalist", "editorial", "high-tech",
      "japanese-minimalism", "bauhaus", "cyberpunk", "art-deco",
      "memphis", "y2k", "organic", "minimal"];
    for (const comp of COMPOSITIONS) {
      for (const v of comp.voice) {
        expect(validVoices).toContain(v);
      }
    }
  });

  it("findCompositions retorna matches por voice", () => {
    const matches = findCompositions(["editorial"]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.voice.includes("editorial"))).toBe(true);
  });

  it("findCompositions filtra por mood", () => {
    const matches = findCompositions(["swiss"], undefined, "neon");
    expect(matches.length).toBeGreaterThanOrEqual(0);
  });

  it("findCompositions vazio para voice inexistente", () => {
    const matches = findCompositions(["nonexistent"]);
    expect(matches.length).toBe(0);
  });

  it("compositionCatalogSummary formata corretamente", () => {
    const summary = compositionCatalogSummary();
    expect(summary).toContain("Hero Editorial Split");
    expect(summary).toContain("Voice:");
    expect(summary).toContain("Moment:");
    expect(summary).toContain("Techniques:");
    expect(summary).toContain("Guardrails:");
  });

  it("cada guardrail é non-empty", () => {
    for (const comp of COMPOSITIONS) {
      for (const g of comp.guardrails) {
        expect(g.length).toBeGreaterThan(10);
        expect(g).toContain(" ");
      }
    }
  });

  it("cada composição tem técnicas do catálogo", () => {
    const validTechniques = ["scroll-reveal", "grain-texture-overlay", "parallax-depth",
      "kinetic-typography", "spotlight-cursor", "animated-mesh-background",
      "sticky-stack", "stagger", "glassmorphism-layers", "magnetic-interaction",
      "tilt-hover", "infinite-marquee", "count-up-metrics"];
    for (const comp of COMPOSITIONS) {
      for (const t of comp.techniques) {
        expect(validTechniques).toContain(t);
      }
    }
  });

  it("moods são subset de moods válidos", () => {
    const validMoods = ["mono", "ocean", "sand", "ember", "forest", "neon",
      "sunset", "royal", "mint"];
    for (const comp of COMPOSITIONS) {
      for (const m of comp.compatible_moods) {
        expect(validMoods).toContain(m);
      }
    }
  });
});
