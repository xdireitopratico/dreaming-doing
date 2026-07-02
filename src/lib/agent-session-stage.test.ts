import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { resolveAgentSessionStage, isAgentSessionRunning } from "@/lib/agent-session-stage";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";

describe("resolveAgentSessionStage", () => {
  it("classifica pending antes do runId real", () => {
    expect(
      resolveAgentSessionStage({
        progress: initialAgentProgress,
        activeRunId: PENDING_RUN_ID,
        running: false,
        connectionState: "connected",
      }),
    ).toBe("pending");
  });

  it("classifica reconnecting enquanto a sessao segue ativa", () => {
    expect(
      resolveAgentSessionStage({
        progress: { ...initialAgentProgress, finished: false },
        activeRunId: "run-1",
        running: true,
        connectionState: "reconnecting",
      }),
    ).toBe("reconnecting");
  });

  it("classifica materializing quando a run terminou mas ainda esta anexada", () => {
    expect(
      resolveAgentSessionStage({
        progress: {
          ...initialAgentProgress,
          finished: true,
          lastFinishOk: true,
          streamText: "done",
        },
        activeRunId: "run-1",
        running: false,
        connectionState: "connected",
      }),
    ).toBe("materializing");
  });

  it("classifica terminal completo quando a sessao ja foi materializada", () => {
    expect(
      resolveAgentSessionStage({
        progress: {
          ...initialAgentProgress,
          finished: true,
          lastFinishOk: true,
          streamText: "done",
        },
        activeRunId: null,
        running: false,
        connectionState: "connected",
      }),
    ).toBe("complete");
  });
});

describe("isAgentSessionRunning", () => {
  it("considera pending, running e reconnecting como estados de execucao", () => {
    expect(isAgentSessionRunning("pending")).toBe(true);
    expect(isAgentSessionRunning("running")).toBe(true);
    expect(isAgentSessionRunning("reconnecting")).toBe(true);
    expect(isAgentSessionRunning("materializing")).toBe(false);
  });
});
