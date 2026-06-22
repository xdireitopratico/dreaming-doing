import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { buildAgentRunView } from "@/lib/forge-run";
import { resolveChatWorking, resolveTurnNarration } from "@/lib/chat/turn-display";

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

  it("resolveChatWorking — run ativa sem conteúdo mostra Pensando", () => {
    const startedAt = Date.now() - 1200;
    const working = resolveChatWorking({
      slotActive: true,
      runStartedAtMs: startedAt,
      hasVisibleContent: false,
    });
    expect(working).toEqual({ status: "active" });
  });

  it("resolveChatWorking — congela após conteúdo visível", () => {
    const startedAt = Date.now() - 4000;
    const working = resolveChatWorking({
      slotActive: true,
      runStartedAtMs: startedAt,
      workingDurationMs: 4000,
      hasVisibleContent: true,
    });
    expect(working).toEqual({ status: "done", durationSec: 4 });
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