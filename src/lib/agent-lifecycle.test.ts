import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { resolveAgentLifecycle } from "@/lib/agent-lifecycle";

describe("resolveAgentLifecycle", () => {
  it("classifica estado vazio como dispatch", () => {
    expect(resolveAgentLifecycle({ progress: initialAgentProgress, activeRunId: "run-1" })).toBe(
      "dispatch",
    );
  });

  it("classifica awaiting como waiting_user", () => {
    expect(
      resolveAgentLifecycle({
        progress: { ...initialAgentProgress, awaiting: true },
        activeRunId: "run-1",
        running: false,
      }),
    ).toBe("waiting_user");
  });

  it("classifica execução ativa sem evidência como running", () => {
    expect(
      resolveAgentLifecycle({
        progress: initialAgentProgress,
        activeRunId: "run-1",
        running: true,
      }),
    ).toBe("running");
  });

  it("classifica sucesso terminal como complete", () => {
    expect(
      resolveAgentLifecycle({
        progress: { ...initialAgentProgress, finished: true, lastFinishOk: true },
        activeRunId: null,
        running: false,
      }),
    ).toBe("complete");
  });

  it("classifica erro recuperável como stale", () => {
    expect(
      resolveAgentLifecycle({
        progress: {
          ...initialAgentProgress,
          finished: true,
          lastFinishOk: false,
          resumable: true,
          error: "Execução interrompida",
        },
        activeRunId: null,
        running: false,
      }),
    ).toBe("stale");
  });
});
