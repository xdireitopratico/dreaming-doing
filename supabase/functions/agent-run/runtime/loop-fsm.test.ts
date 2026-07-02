import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emitLoopFsmTransition } from "./loop-fsm.ts";

Deno.test("emitLoopFsmTransition — transição interna sem SSE", async () => {
  const emitted: Array<{ type: string; data: Record<string, unknown> }> = [];
  const next = await emitLoopFsmTransition(
    { name: "idle", since: Date.now() },
    "start",
    (type, data) => {
      emitted.push({ type, data: data as Record<string, unknown> });
    },
  );
  assertEquals(emitted.length, 0);
  assertEquals(typeof next.name, "string");
});