import { describe, expect, it } from "vitest";
import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import {
  createStreamRowHandlers,
  freezeWorkingDuration,
  type AgentStreamRow,
} from "@/hooks/agent-run/agent-run-stream";

function makeRefs(overrides?: Partial<{ runId: string | null; lastSeq: number }>) {
  return {
    runIdRef: { current: overrides?.runId ?? "run-a" },
    lastSeqRef: { current: overrides?.lastSeq ?? 0 },
    activeRunStartedAtMsRef: { current: Date.now() - 2000 },
    streamProcessingRef: { current: false },
    streamBufferRef: { current: [] as AgentStreamRow[] },
  };
}

function startRow(seq: number, runId = "run-a"): AgentStreamRow {
  return {
    seq,
    event_type: "start",
    payload: {},
    run_id: runId,
  };
}

describe("freezeWorkingDuration", () => {
  it("congela duração quando há conteúdo visível", () => {
    const started = Date.now() - 3000;
    const next = freezeWorkingDuration(
      { ...initialAgentProgress, streamText: "hello" },
      started,
    );
    expect(next.workingDurationMs).toBeGreaterThanOrEqual(1000);
  });

  it("não altera se já tem workingDurationMs", () => {
    const p = { ...initialAgentProgress, workingDurationMs: 5000, streamText: "x" };
    expect(freezeWorkingDuration(p, Date.now())).toBe(p);
  });
});

describe("createStreamRowHandlers", () => {
  it("descarta seq duplicada", () => {
    const refs = makeRefs({ lastSeq: 3 });
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
    });

    const dropped = enqueueStreamRow(startRow(2));
    expect(dropped).toBe(false);
    expect(refs.lastSeqRef.current).toBe(3);
  });

  it("aplica seq contígua e atualiza lastSeq", () => {
    const refs = makeRefs({ lastSeq: 0 });
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
    });

    enqueueStreamRow(startRow(1));
    expect(refs.lastSeqRef.current).toBe(1);
    expect(progress.finished).toBe(false);
  });

  it("serializa rows concorrentes via buffer", () => {
    const refs = makeRefs({ lastSeq: 0 });
    const applied: number[] = [];
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
      applied.push(refs.lastSeqRef.current);
    });

    refs.streamProcessingRef.current = true;
    enqueueStreamRow(startRow(1));
    expect(refs.streamBufferRef.current).toHaveLength(1);

    refs.streamProcessingRef.current = false;
    enqueueStreamRow(startRow(2));
    expect(refs.streamBufferRef.current).toHaveLength(0);
    expect(refs.lastSeqRef.current).toBe(2);
  });

  it("reseta lastSeq em start de runId diferente", () => {
    const refs = makeRefs({ runId: "run-a", lastSeq: 10 });
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
    });

    enqueueStreamRow(startRow(1, "run-b"));
    expect(refs.lastSeqRef.current).toBe(1);
    expect(progress.finished).toBe(false);
  });

  it("descarta rows do buffer com runId antigo", () => {
    const refs = makeRefs({ runId: "run-new", lastSeq: 0 });
    refs.streamBufferRef.current = [startRow(1, "run-old"), startRow(2, "run-new")];
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
    });

    enqueueStreamRow(startRow(1, "run-new"));
    expect(refs.lastSeqRef.current).toBe(2);
  });
});