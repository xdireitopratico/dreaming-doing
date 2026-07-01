import { describe, expect, it, vi } from "vitest";
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
    closedRunIdRef: { current: null as string | null },
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

function thinkingRow(seq: number, text: string, runId = "run-a"): AgentStreamRow {
  return {
    seq,
    event_type: "thinking_text",
    payload: { text, append: true, delta: true, final: false },
    run_id: runId,
  };
}

describe("freezeWorkingDuration", () => {
  it("congela duração quando há conteúdo visível", () => {
    const started = Date.now() - 3000;
    const next = freezeWorkingDuration({ ...initialAgentProgress, streamText: "hello" }, started);
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

  it("prioriza live rows sobre replay quando ambos entram no buffer", () => {
    const refs = makeRefs({ lastSeq: 0 });
    const applied: Array<string> = [];
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
      applied.push(`${refs.lastSeqRef.current}:${progress.timeline.length}`);
    });

    refs.streamProcessingRef.current = true;
    enqueueStreamRow({ ...startRow(2), source: "db" });
    enqueueStreamRow({ ...startRow(1), source: "live" });
    expect(refs.streamBufferRef.current[0]?.source).toBe("live");

    refs.streamProcessingRef.current = false;
    enqueueStreamRow(startRow(3));
    expect(refs.lastSeqRef.current).toBe(3);
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

  it("reordena eventos fora de ordem dentro da janela (preenche gap)", () => {
    const refs = makeRefs({ lastSeq: 0 });
    const applied: number[] = [];
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
      applied.push(refs.lastSeqRef.current);
    });
    // seq 2 chega antes da 1 (Realtime fora de ordem) → buffer; 1 chega → aplica 1 depois 2.
    enqueueStreamRow(startRow(2));
    expect(refs.lastSeqRef.current).toBe(0); // 2 bufferizado, nada aplicado
    enqueueStreamRow(startRow(1));
    expect(refs.lastSeqRef.current).toBe(2); // 1 aplicou, drenou 2 em ordem
    expect(applied).toEqual([1, 2]);
  });

  it("aceita gap após janela expirar (seq realmente perdido)", () => {
    vi.useFakeTimers();
    const refs = makeRefs({ lastSeq: 0 });
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
    });
    enqueueStreamRow(startRow(3)); // gap (3 > 0+1) → bufferizado
    expect(refs.lastSeqRef.current).toBe(0);
    vi.advanceTimersByTime(80); // janela expira
    expect(refs.lastSeqRef.current).toBe(3); // aceita o gap
    vi.useRealTimers();
  });

  it("ignora rows atrasadas do run já encerrado", () => {
    const refs = makeRefs({ lastSeq: 1 });
    refs.closedRunIdRef.current = "run-a";
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
    });

    const applied = enqueueStreamRow(startRow(2, "run-a"));
    expect(applied).toBe(false);
    expect(refs.lastSeqRef.current).toBe(1);
    expect(progress.timeline).toHaveLength(0);
  });

  it("coalesc deltas thinking_text em poucos updates React", async () => {
    vi.useFakeTimers();
    const refs = makeRefs({ lastSeq: 0 });
    let progress = initialAgentProgress;
    const updates: number[] = [];
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
      updates.push(refs.lastSeqRef.current);
    });

    // start ocupa seq 1; thinking_text começa em seq 2.
    enqueueStreamRow(startRow(1));
    enqueueStreamRow(thinkingRow(2, "O"));
    enqueueStreamRow(thinkingRow(3, "lá"));
    for (let i = 4; i <= 50; i++) {
      enqueueStreamRow(thinkingRow(i, ` ${i}`));
    }

    expect(refs.lastSeqRef.current).toBe(1); // ainda não aplicou nada do lote
    expect(updates.length).toBe(1); // só o start

    await vi.advanceTimersByTimeAsync(8);

    expect(refs.lastSeqRef.current).toBe(50);
    expect(progress.privateThoughtText).toBe(
      "Olá" + Array.from({ length: 47 }, (_, i) => ` ${i + 4}`).join(""),
    );
    // start (1 update) + lote de thinking (1 update)
    expect(updates.length).toBeLessThanOrEqual(2);
    vi.useRealTimers();
  });

  it("despeja lote de thinking antes de evento não-thinking manter ordem", async () => {
    vi.useFakeTimers();
    const refs = makeRefs({ lastSeq: 1 });
    let progress = initialAgentProgress;
    const { enqueueStreamRow } = createStreamRowHandlers(refs, (updater) => {
      progress = typeof updater === "function" ? updater(progress) : updater;
    });

    enqueueStreamRow(startRow(1));
    enqueueStreamRow(thinkingRow(2, "pensando"));
    enqueueStreamRow(thinkingRow(3, " mais"));
    // Um step em seguida força flush imediato e mantém seqs corretas.
    const stepApplied = enqueueStreamRow({
      seq: 4,
      event_type: "step",
      payload: { current: 1, total: 3, label: "setup" },
      run_id: "run-a",
    });

    expect(stepApplied).toBe(false);
    expect(refs.lastSeqRef.current).toBe(4);
    expect(progress.privateThoughtText).toBe("pensando mais");
    expect(progress.timeline.some((e) => e.type === "step")).toBe(true);
    vi.useRealTimers();
  });
});
