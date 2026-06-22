import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createAgentLoopMutableState } from "./loop-mutable-state.ts";

Deno.test("createAgentLoopMutableState — defaults e override", () => {
  const m = createAgentLoopMutableState({ toolMissCount: 2, forceToolsNext: true });
  assertEquals(m.toolMissCount, 2);
  assertEquals(m.forceToolsNext, true);
  assertEquals(m.lastCheckpointStep, 0);
});