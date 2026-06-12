import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildAgentRunView } from "@/lib/forge-run";
import { resolveTurnNarration, resolveTurnThinking } from "@/lib/chat/turn-display";

describe("turn-display — entrou, permanece", () => {
  it("resolveTurnThinking — congela latencyThoughtMs após terminal", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      latencyThoughtMs: 4200,
    };
    const thinking = resolveTurnThinking(progress, null, null, false);
    expect(thinking).not.toBeNull();
    expect(thinking?.active).toBe(false);
    expect(thinking?.durationMs).toBe(4200);
  });

  it("resolveTurnNarration — permanece distinta do stream final", () => {
    const progress = {
      ...initialAgentProgress,
      finished: true,
      narrationText: "Vou investigar o estado atual do container DP Lara.",
      streamText: "Olá! Como posso ajudar?",
    };
    const runView = buildAgentRunView("run-1", progress, { running: false });
    const narration = resolveTurnNarration(progress, runView, "Olá! Como posso ajudar?");
    expect(narration).toBe("Vou investigar o estado atual do container DP Lara.");
  });

  it("resolveTurnNarration — permanece mesmo se stream contém o texto", () => {
    const narrationLine = "Vou investigar o estado atual do container DP Lara.";
    const progress = {
      ...initialAgentProgress,
      finished: true,
      narrationText: narrationLine,
      streamText: `${narrationLine} Pronto no preview.`,
    };
    const runView = buildAgentRunView("run-1", progress, { running: false });
    const narration = resolveTurnNarration(progress, runView, progress.streamText);
    expect(narration).toBe(narrationLine);
  });

  it("buildAgentRunView — narration line persiste quando terminal", () => {
    const view = buildAgentRunView("run-1", {
      ...initialAgentProgress,
      finished: true,
      streamText: "Pronto!",
      narrationText: "Vou criar a landing com Hero e CTA.",
    });
    expect(view.narration).toBe("Vou criar a landing com Hero e CTA.");
    expect(view.closingText).toBe("Pronto!");
  });
});