import { describe, expect, it } from "vitest";
import { buildForgePlanMarkdown } from "@/lib/plan-document";

describe("buildForgePlanMarkdown", () => {
  it("gera markdown Lovable: título, Princípio, Estado atual e Entregas", () => {
    const doc = buildForgePlanMarkdown({
      summary: "Landing para café",
      rationale: "Começar pelo hero e depois formulário.",
      steps: [
        { id: "s1", type: "custom", description: "Criar hero", enabled: true },
        { id: "s2", type: "custom", description: "Adicionar formulário", enabled: true },
      ],
    });
    expect(doc.markdown).toContain("# Landing para café");
    expect(doc.markdown).toContain("## Princípio (sua regra)");
    expect(doc.markdown).toContain("## Estado atual (o que está errado)");
    expect(doc.markdown).toContain("## Entregas");
    expect(doc.markdown).toContain("- Criar hero");
    expect(doc.markdown).toContain("## Fora do escopo");
  });
});
