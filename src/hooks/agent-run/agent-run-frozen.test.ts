import { describe, expect, it } from "vitest";
import { initialAgentProgress } from "@/lib/agent-progress";
import { createFrozenProgressHandlers } from "@/hooks/agent-run/agent-run-frozen";

describe("createFrozenProgressHandlers", () => {
  it("congela progress do run ativo", () => {
    const runIdRef = { current: "run-1" };
    const progress = {
      ...initialAgentProgress,
      streamText: "working",
      timeline: [{ type: "done", data: {}, timestamp: Date.now() }],
    };
    const progressRef = { current: progress };
    const frozenRunProgressRef = { current: new Map() };
    let tick = 0;
    let activeRunId: string | null = "run-1";
    const closedRunIdRef = { current: null as string | null };

    const { freezeRunProgress, getFrozenRunProgress } = createFrozenProgressHandlers({
      runIdRef,
      closedRunIdRef,
      progressRef,
      frozenRunProgressRef,
      setActiveRunId: (v) => {
        activeRunId = typeof v === "function" ? v(activeRunId) : v;
      },
      setActiveRunStartedAtMs: () => {},
      bumpFrozenProgressTick: () => {
        tick += 1;
      },
    });

    freezeRunProgress("run-1");
    const frozen = getFrozenRunProgress("run-1");
    expect(frozen?.streamText).toBe("working");
    expect(frozen?.timeline).toHaveLength(1);
    expect(tick).toBe(1);
    expect(activeRunId).toBe("run-1");
  });

  it("releaseLiveRunSlot limpa run ativo", () => {
    const runIdRef = { current: "run-1" };
    const progressRef = {
      current: {
        ...initialAgentProgress,
        streamText: "x",
        timeline: [{ type: "done", data: {}, timestamp: Date.now() }],
      },
    };
    const frozenRunProgressRef = { current: new Map() };
    let activeRunId: string | null = "run-1";
    let startedAt: number | null = 1000;
    const closedRunIdRef = { current: null as string | null };

    const { releaseLiveRunSlot } = createFrozenProgressHandlers({
      runIdRef,
      closedRunIdRef,
      progressRef,
      frozenRunProgressRef,
      setActiveRunId: (v) => {
        activeRunId = typeof v === "function" ? v(activeRunId) : v;
      },
      setActiveRunStartedAtMs: (v) => {
        startedAt = typeof v === "function" ? v(startedAt) : v;
      },
      bumpFrozenProgressTick: () => {},
    });

    releaseLiveRunSlot("run-1");
    expect(runIdRef.current).toBeNull();
    expect(activeRunId).toBeNull();
    expect(startedAt).toBeNull();
    expect(frozenRunProgressRef.current.has("run-1")).toBe(true);
  });
});
