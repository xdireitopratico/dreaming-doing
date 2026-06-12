import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildAgentNarrative } from "@/lib/agent-narrative";

describe("buildAgentNarrative", () => {
  it("headline prioriza tool ativa — não expõe passo interno X/Y", () => {
    const progress = {
      ...initialAgentProgress,
      finished: false,
      tools: [{ name: "fs_edit", args: { path: "src/App.tsx" } }],
      phase: "execute",
      message: "Executando passo 1 de 15…",
    };
    const n = buildAgentNarrative(progress, { running: true });
    expect(n.headline).toContain("Editando");
    expect(n.headline).not.toContain("passo");
    expect(n.showTyping).toBe(true);
  });

  it("fallback headline quando run ativo sem fase/tool", () => {
    const progress = {
      ...initialAgentProgress,
      finished: false,
      phase: null,
      message: null,
      statusHint: null,
    };
    const n = buildAgentNarrative(progress, { running: true });
    expect(n.headline).toBe("Trabalhando no seu pedido…");
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
