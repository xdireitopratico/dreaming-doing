import { describe, expect, it } from "vitest";
import { buildForgePlanMarkdown } from "@/lib/plan-document";

describe("buildForgePlanMarkdown", () => {
  it("gera seções Missão, Objetivo e Fases", () => {
    const doc = buildForgePlanMarkdown({
      summary: "Landing para café",
      rationale: "Começar pelo hero e depois formulário.",
      steps: [
        { id: "s1", type: "custom", description: "Criar hero", enabled: true },
        { id: "s2", type: "custom", description: "Adicionar formulário", enabled: true },
      ],
    });
    expect(doc.markdown).toContain("## Missão");
    expect(doc.markdown).toContain("## Objetivo");
    expect(doc.markdown).toContain("## Fases");
    expect(doc.markdown).toContain("## Fora do escopo");
  });
});