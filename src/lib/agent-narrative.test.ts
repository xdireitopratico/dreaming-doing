import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildAgentNarrative } from "@/lib/agent-narrative";

describe("buildAgentNarrative", () => {
  it("mostra headline com tool ativa durante run", () => {
    const progress = {
      ...initialAgentProgress,
      finished: false,
      tools: [{ name: "fs_edit", args: { path: "src/App.tsx" } }],
      phase: "execute",
      message: "Executando passo 1…",
    };
    const n = buildAgentNarrative(progress, { running: true });
    expect(n.headline).toContain("Editando src/App.tsx");
    expect(n.showTyping).toBe(true);
  });

  it("prioriza streamText como body", () => {
    const progress = {
      ...initialAgentProgress,
      streamText: "Vou criar a landing page agora.",
      finished: false,
    };
    const n = buildAgentNarrative(progress, { running: true });
    expect(n.body).toBe("Vou criar a landing page agora.");
    expect(n.showTyping).toBe(false);
  });
});