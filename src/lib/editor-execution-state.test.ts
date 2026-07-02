import { describe, expect, it } from "vitest";

import { initialAgentProgress } from "@/lib/agent-progress";
import {
  isEditorExecutionLiveRun,
  isEditorExecutionTurnActive,
  resolveEditorExecutionStage,
} from "@/lib/editor-execution-state";
import { PENDING_RUN_ID } from "@/lib/pending-run-id";

describe("resolveEditorExecutionStage", () => {
  it("classifica pending turn como submitting", () => {
    expect(
      resolveEditorExecutionStage({
        activeRunId: PENDING_RUN_ID,
        progress: { ...initialAgentProgress, finished: false },
      }),
    ).toBe("submitting");
  });

  it("mantem run real sem evidencias em submitting", () => {
    expect(
      resolveEditorExecutionStage({
        activeRunId: "run-1",
        progress: { ...initialAgentProgress, finished: false },
      }),
    ).toBe("submitting");
  });

  it("sobe para live_run quando ha evidencia material", () => {
    expect(
      resolveEditorExecutionStage({
        activeRunId: "run-1",
        progress: {
          ...initialAgentProgress,
          finished: false,
          timeline: [{ type: "phase", data: { phase: "build" }, timestamp: Date.now() }],
        },
      }),
    ).toBe("live_run");
  });

  it("classifica awaiting como awaiting_user", () => {
    expect(
      resolveEditorExecutionStage({
        activeRunId: "run-1",
        progress: {
          ...initialAgentProgress,
          finished: true,
          awaiting: true,
          awaitingKind: "clarify",
        },
      }),
    ).toBe("awaiting_user");
  });

  it("classifica terminal quando finished", () => {
    expect(
      resolveEditorExecutionStage({
        activeRunId: null,
        progress: { ...initialAgentProgress, finished: true, lastFinishOk: true },
      }),
    ).toBe("terminal");
  });
});

describe("editor execution flags", () => {
  it("marca turn active apenas para submitting/live_run", () => {
    expect(isEditorExecutionTurnActive("submitting")).toBe(true);
    expect(isEditorExecutionTurnActive("live_run")).toBe(true);
    expect(isEditorExecutionTurnActive("idle")).toBe(false);
  });

  it("marca live run apenas para live_run", () => {
    expect(isEditorExecutionLiveRun("live_run")).toBe(true);
    expect(isEditorExecutionLiveRun("submitting")).toBe(false);
  });
});
