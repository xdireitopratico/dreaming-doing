import { describe, expect, it } from "vitest";
import { reviewSynthesis, criticSummary, criticChecklistForPrompt, GLOBAL_ANTI_PATTERNS, DESIGN_AUTO_CHECK } from "./critic";
import { synthesize } from "../synthesis/engine";

describe("Design Critic", () => {
  it("aprova síntese válida", () => {
    const proposal = synthesize({ domain: "padaria artesanal" });
    const result = reviewSynthesis(proposal);
    expect(result.pass).toBe(true);
  });

  it("bloqueia linguagem inexistente", () => {
    const result = reviewSynthesis({
      voice: ["nonexistent-lang"],
      reasoning: "test",
      moment: "Hero assimétrico com tipografia display",
      techniques: ["scroll-reveal"],
      relevant_dnas: [],
      mood: "mono",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.8,
    });
    expect(result.pass).toBe(false);
    expect(result.blocks.some((b) => b.includes("não existe"))).toBe(true);
  });

  it("bloqueia linguagens conflitantes", () => {
    const result = reviewSynthesis({
      voice: ["cyberpunk", "editorial"],
      reasoning: "test",
      moment: "Hero assimétrico com tipografia display",
      techniques: ["scroll-reveal"],
      relevant_dnas: [],
      mood: "neon",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.8,
    });
    expect(result.pass).toBe(false);
    expect(result.blocks.some((b) => b.includes("CONFLITA"))).toBe(true);
  });

  it("bloqueia momento genérico", () => {
    const result = reviewSynthesis({
      voice: ["swiss", "editorial"],
      reasoning: "test",
      moment: "hero centralizado com 3 cards abaixo",
      techniques: ["scroll-reveal"],
      relevant_dnas: [],
      mood: "mono",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.8,
    });
    expect(result.pass).toBe(false);
    expect(result.blocks.some((b) => b.includes("genérico"))).toBe(true);
  });

  it("avisa técnica inexistente", () => {
    const result = reviewSynthesis({
      voice: ["swiss"],
      reasoning: "test",
      moment: "Hero assimétrico com tipografia display",
      techniques: ["magic-unicorn-effect"],
      relevant_dnas: [],
      mood: "mono",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.8,
    });
    expect(result.warnings.some((w) => w.includes("não existe"))).toBe(true);
  });

  it("avisa confidence baixa", () => {
    const result = reviewSynthesis({
      voice: ["swiss"],
      reasoning: "test",
      moment: "Hero assimétrico com tipografia display",
      techniques: ["scroll-reveal"],
      relevant_dnas: [],
      mood: "mono",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.3,
    });
    expect(result.warnings.some((w) => w.includes("Confiança baixa"))).toBe(true);
  });

  it("sugere mais técnicas quando vazio", () => {
    const result = reviewSynthesis({
      voice: ["swiss", "editorial"],
      reasoning: "test",
      moment: "Hero assimétrico com tipografia display",
      techniques: [],
      relevant_dnas: [],
      mood: "mono",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.8,
    });
    expect(result.suggestions.some((s) => s.includes("Nenhuma técnica"))).toBe(true);
  });

  it("avisa mais de 4 técnicas", () => {
    const result = reviewSynthesis({
      voice: ["swiss"],
      reasoning: "test",
      moment: "Hero assimétrico",
      techniques: ["scroll-reveal", "stagger", "parallax", "spotlight", "magnetic"],
      relevant_dnas: [],
      mood: "mono",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.8,
    });
    expect(result.warnings.some((w) => w.includes("técnicas selecionadas"))).toBe(true);
  });

  it("avisa mood incompatível com linguagem", () => {
    const result = reviewSynthesis({
      voice: ["swiss"],
      reasoning: "test",
      moment: "Hero assimétrico",
      techniques: ["scroll-reveal"],
      relevant_dnas: [],
      mood: "neon",
      anti_patterns: [],
      research_queries: [],
      confidence: 0.8,
    });
    expect(result.warnings.some((w) => w.includes("Mood"))).toBe(true);
  });
});

describe("GLOBAL_ANTI_PATTERNS", () => {
  it("tem 5 anti-padrões definidos", () => {
    expect(GLOBAL_ANTI_PATTERNS.length).toBe(5);
  });
});

describe("DESIGN_AUTO_CHECK", () => {
  it("tem 5 checks", () => {
    expect(DESIGN_AUTO_CHECK.length).toBe(5);
  });

  it("todos são required", () => {
    expect(DESIGN_AUTO_CHECK.every((c) => c.required)).toBe(true);
  });
});

describe("criticSummary", () => {
  it("formata PASS", () => {
    const result = reviewSynthesis(synthesize({ domain: "cafe" }));
    const summary = criticSummary(result);
    expect(summary).toContain("PASS");
  });
});

describe("criticChecklistForPrompt", () => {
  it("inclui todos os checks", () => {
    const checklist = criticChecklistForPrompt();
    expect(checklist).toContain("OBRIGATÓRIO");
    expect(checklist.split("\n").length).toBe(5);
  });
});
