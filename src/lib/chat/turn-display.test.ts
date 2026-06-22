import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildAgentRunView } from "@/lib/forge-run";
import { resolveTurnNarration, resolveTurnThinking } from "@/lib/chat/turn-display";

describe("turn-display — entrou, permanece", () => {
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

  it("resolveTurnThinking — run ativa mostra latency Pensando", () => {
    const startedAt = Date.now() - 1200;
    const thinking = resolveTurnThinking(null, { slotActive: true, runStartedAtMs: startedAt });
    expect(thinking).toEqual({ variant: "latency", active: true, startedAtMs: startedAt });
  });

  it("resolveTurnThinking — frozen latency após 1º token", () => {
    const startedAt = Date.now() - 4000;
    const view = buildAgentRunView(
      "run-1",
      { ...initialAgentProgress, finished: false, latencyThoughtMs: 4000 },
      { running: true, runStartedAtMs: startedAt },
    );
    const thinking = resolveTurnThinking(view, { slotActive: true, runStartedAtMs: startedAt });
    expect(thinking?.variant).toBe("latency");
    expect(thinking?.active).toBe(false);
    expect(thinking?.durationMs).toBe(4000);
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
