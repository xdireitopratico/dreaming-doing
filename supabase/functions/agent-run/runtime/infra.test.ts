import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loopBudgetExceeded,
  maybeEmitSilenceHeartbeat,
  SILENCE_HEARTBEAT_MS,
} from "./infra.ts";
import type { RunInfraDeps } from "./infra.ts";
import { LoopPhase } from "../types.ts";

function mockInfraDeps(overrides?: Partial<RunInfraDeps>): RunInfraDeps & {
  events: Array<{ type: string; data: unknown }>;
} {
  const events: Array<{ type: string; data: unknown }> = [];
  let lastActivityAt = Date.now() - SILENCE_HEARTBEAT_MS - 1;
  return {
    sb: {},
    runId: "run-1",
    runStartTime: Date.now() - 10_000,
    loopBudgetMs: 5_000,
    getLastActivityAt: () => lastActivityAt,
    setLastActivityAt: (ms) => {
      lastActivityAt = ms;
    },
    getMaxStepsLimit: () => 60,
    touchedPaths: new Set(),
    narrationTrim: () => "",
    narrationBuffer: "",
    emit: (type, data) => events.push({ type, data }),
    getPhase: () => LoopPhase.GATHER_CONTEXT,
    saveCheckpoint: async () => {},
    persistCheckpointChat: async () => {},
    events,
    ...overrides,
  };
}

Deno.test("loopBudgetExceeded — true após janela", () => {
  const deps = mockInfraDeps({
    runStartTime: Date.now() - 10_000,
    loopBudgetMs: 5_000,
  });
  assertEquals(loopBudgetExceeded(deps), true);
});

Deno.test("loopBudgetExceeded — false dentro da janela", () => {
  const deps = mockInfraDeps({
    runStartTime: Date.now() - 1_000,
    loopBudgetMs: 60_000,
  });
  assertEquals(loopBudgetExceeded(deps), false);
});

Deno.test("maybeEmitSilenceHeartbeat — emite após 90s de silêncio", () => {
  const deps = mockInfraDeps();
  maybeEmitSilenceHeartbeat(deps);
  assertEquals(deps.events.length, 1);
  assertEquals(deps.events[0].type, "heartbeat");
});

Deno.test("maybeEmitSilenceHeartbeat — não emite com atividade recente", () => {
  const deps = mockInfraDeps({
    getLastActivityAt: () => Date.now(),
  });
  maybeEmitSilenceHeartbeat(deps);
  assertEquals(deps.events.length, 0);
});