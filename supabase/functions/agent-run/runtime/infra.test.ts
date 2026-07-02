import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  maybeEmitSilenceHeartbeat,
  platformLimitExceeded,
  SILENCE_HEARTBEAT_MS,
} from "./infra.ts";
import type { RunInfraDeps } from "./infra.ts";
import { LoopPhase } from "../types.ts";
import { INNGEST_FINISH_MS, PLATFORM_YIELD_BUFFER_MS } from "./platform-deadline.ts";

function mockInfraDeps(overrides?: Partial<RunInfraDeps>): RunInfraDeps & {
  events: Array<{ type: string; data: unknown }>;
} {
  const events: Array<{ type: string; data: unknown }> = [];
  let lastActivityAt = Date.now() - SILENCE_HEARTBEAT_MS - 1;
  return {
    sb: {},
    runId: "run-1",
    invocationStartedAt: Date.now() - 10_000,
    getLastActivityAt: () => lastActivityAt,
    setLastActivityAt: (ms) => {
      lastActivityAt = ms;
    },
    getMaxStepsLimit: () => 60,
    touchedPaths: new Set(),
    getMessages: () => [],
    originalUserRequest: "test",
    narrationTrim: () => "",
    narrationBuffer: "",
    emit: (type, data) => events.push({ type, data }),
    getPhase: () => LoopPhase.GATHER_CONTEXT,
    saveCheckpoint: async () => {},
    getBuildSession: () => null,
    events,
    ...overrides,
  };
}

Deno.test("platformLimitExceeded — false dentro da janela", () => {
  const deps = mockInfraDeps({
    invocationStartedAt: Date.now() - 1_000,
  });
  assertEquals(platformLimitExceeded(deps), false);
});

Deno.test("platformLimitExceeded — true perto do teto Inngest", () => {
  const deps = mockInfraDeps({
    invocationStartedAt: Date.now() - (INNGEST_FINISH_MS - PLATFORM_YIELD_BUFFER_MS + 1),
  });
  assertEquals(platformLimitExceeded(deps), true);
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