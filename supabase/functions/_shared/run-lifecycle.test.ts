import { assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canTransitionRunStatus } from "./agent-contract-lifecycle.ts";
import { partitionRunExtras } from "./run-lifecycle.ts";

Deno.test("canTransitionRunStatus — failed → running (resume)", () => {
  assertEquals(canTransitionRunStatus("failed", "running"), true);
});

Deno.test("canTransitionRunStatus — completed → awaiting_user (repair)", () => {
  assertEquals(canTransitionRunStatus("completed", "awaiting_user"), true);
});

Deno.test("canTransitionRunStatus — canceled permanece terminal", () => {
  assertFalse(canTransitionRunStatus("canceled", "completed"));
});

Deno.test("partitionRunExtras — colunas vs meta", () => {
  const { columns, metaDelta } = partitionRunExtras({
    error: "boom",
    steps: 3,
    heartbeat_at: "2026-01-01T00:00:00Z",
    canceled_at: "2026-01-01T00:00:00Z",
    status: "failed",
    finished_at: "2026-01-01T00:00:00Z",
    summary: "done",
    meta: { awaitingUser: true },
  });
  assertEquals(columns, {
    error: "boom",
    steps: 3,
    heartbeat_at: "2026-01-01T00:00:00Z",
    canceled_at: "2026-01-01T00:00:00Z",
  });
  assertEquals(metaDelta, { summary: "done", awaitingUser: true });
});