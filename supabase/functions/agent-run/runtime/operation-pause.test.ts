import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pauseOperationForUser } from "./infra.ts";
import type { RunInfraDeps } from "./infra.ts";
import { LoopPhase } from "../types.ts";

function mockSupabaseForPause() {
  return {
    from: (table: string) => {
      if (table !== "agent_runs") {
        return {};
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { status: "running", meta: {} }, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    },
  };
}

Deno.test("pauseOperationForUser — emite run_paused e finish sem auto-enfileirar", async () => {
  const events: Array<{ type: string; data: unknown }> = [];
  let checkpointSaved = false;

  const deps: RunInfraDeps = {
    sb: mockSupabaseForPause(),
    runId: "run-pause-1",
    invocationStartedAt: Date.now(),
    getLastActivityAt: () => Date.now(),
    setLastActivityAt: () => {},
    getMaxStepsLimit: () => 60,
    touchedPaths: new Set(["src/App.tsx"]),
    getMessages: () => [],
    originalUserRequest: "build landing",
    narrationTrim: () => "",
    narrationBuffer: "",
    emit: (type, data) => events.push({ type, data }),
    getPhase: () => LoopPhase.EXECUTE_STEP,
    saveCheckpoint: async () => {
      checkpointSaved = true;
    },
    getBuildSession: () => null,
    persistFinal: async () => {},
  };

  const result = await pauseOperationForUser(deps, {
    reason: "operation_wall",
    message: "Limite de tempo — clique Continuar.",
    steps: 12,
    toolsUsed: new Set(["fs_write"]),
  });

  assertEquals(checkpointSaved, true);
  assertEquals(result.awaiting, true);
  assertEquals(result.resumable, false);
  assertEquals(events.some((e) => e.type === "run_paused"), true);
  assertEquals(
    events.some(
      (e) => e.type === "finish" && (e.data as { resumable?: boolean }).resumable === false,
    ),
    true,
  );
  assertEquals(
    events.some(
      (e) => e.type === "assistant_text" && (e.data as { final?: boolean }).final === true,
    ),
    true,
  );
});