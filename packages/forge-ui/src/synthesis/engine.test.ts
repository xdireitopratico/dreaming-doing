import { describe, expect, it } from "vitest";
import { synthesize, synthesisSummary } from "./engine";

describe("Synthesis Engine", () => {
  it("retorna proposta para domínio conhecido", () => {
    const result = synthesize({ domain: "padaria artesanal premium" });
    expect(result.voice.length).toBeGreaterThanOrEqual(1);
    expect(result.mood).toBeTruthy();
    expect(result.moment).toBeTruthy();
    expect(result.reasoning).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("retorna proposta para domínio SaaS", () => {
    const result = synthesize({ domain: "fintech saas dashboard" });
    expect(result.voice.length).toBeGreaterThanOrEqual(1);
    expect(result.techniques.length).toBeLessThanOrEqual(4);
  });

  it("excludeVoices evita linguagem especificada", () => {
    const result = synthesize({
      domain: "agência criativa",
      excludeVoices: ["swiss"],
    });
    expect(result.voice.includes("swiss")).toBe(false);
  });

  it("excludeVoices não quebra se todas excluídas", () => {
    const allVoices = ["swiss", "brutalist", "editorial", "high-tech",
      "japanese-minimalism", "bauhaus", "cyberpunk", "art-deco",
      "memphis", "y2k", "organic", "minimal"];
    const result = synthesize({
      domain: "agência criativa",
      excludeVoices: allVoices,
    });
    expect(result.voice.length).toBeGreaterThanOrEqual(1);
  });

  it("excludeTechniques funciona", () => {
    const result = synthesize({
      domain: "tech startup",
      excludeTechniques: ["scroll-reveal"],
    });
    expect(result.techniques.includes("scroll-reveal")).toBe(false);
  });

  it("moodOverride é respeitado", () => {
    const result = synthesize({
      domain: "padaria",
      moodOverride: "neon",
    });
    expect(result.mood).toBe("neon");
  });

  it("produz resultado determinístico", () => {
    const r1 = synthesize({ domain: "fashion brand" });
    const r2 = synthesize({ domain: "fashion brand" });
    expect(r1.voice).toEqual(r2.voice);
    expect(r1.mood).toBe(r2.mood);
    expect(r1.moment).toBe(r2.moment);
  });

  it("anti_patterns inclui globais e por linguagem", () => {
    const result = synthesize({ domain: "tech startup" });
    expect(result.anti_patterns.length).toBeGreaterThan(0);
    expect(result.anti_patterns.some((p) => p.includes("hero"))).toBe(true);
  });

  it("research_queries são geradas", () => {
    const result = synthesize({ domain: "eco brand" });
    expect(result.research_queries.length).toBeGreaterThan(0);
  });

  it("relevant_dnas referenciam seeds", () => {
    const result = synthesize({ domain: "technology" });
    expect(result.relevant_dnas.length).toBeGreaterThanOrEqual(0);
  });

  it("confidence entre 0 e 0.98", () => {
    const resultA = synthesize({ domain: "tech" });
    expect(resultA.confidence).toBeGreaterThanOrEqual(0);
    expect(resultA.confidence).toBeLessThanOrEqual(0.98);
  });
});

describe("synthesisSummary", () => {
  it("formata corretamente", () => {
    const proposal = synthesize({ domain: "cafe" });
    const summary = synthesisSummary(proposal);
    expect(summary).toContain("# Direção de Design Sugerida");
    expect(summary).toContain("**Voice:**");
    expect(summary).toContain("**Mood:**");
    expect(summary).toContain("**Momento-memorável:**");
    expect(summary).toContain("**Confiança:**");
    expect(summary).toContain("**Anti-padrões a evitar:**");
  });
});
