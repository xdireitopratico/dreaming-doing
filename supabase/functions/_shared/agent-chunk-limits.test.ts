import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateChunkLimits,
  MAX_BUILD_FIX_ATTEMPTS,
  MAX_CHUNK_GENERATIONS,
} from "./agent-chunk-limits.ts";

Deno.test("evaluateChunkLimits — dentro do limite", () => {
  const decision = evaluateChunkLimits({ chunkGeneration: 2 }, new Date().toISOString());
  assertEquals(decision.exceeded, false);
  assertEquals(decision.chunkGeneration, 3);
});

Deno.test("evaluateChunkLimits — estoura chunk cap", () => {
  const decision = evaluateChunkLimits(
    { chunkGeneration: MAX_CHUNK_GENERATIONS },
    new Date().toISOString(),
  );
  assertEquals(decision.exceeded, true);
  assertEquals(decision.reason, "chunk_cap");
});

Deno.test("evaluateChunkLimits — buildFix não incrementa chunkGeneration", () => {
  const decision = evaluateChunkLimits(
    { chunkGeneration: 5, buildFixAttempts: 2 },
    new Date().toISOString(),
    Date.now(),
    { buildFix: true },
  );
  assertEquals(decision.exceeded, false);
  assertEquals(decision.chunkGeneration, 5);
  assertEquals(decision.buildFixAttempts, 3);
});

Deno.test("evaluateChunkLimits — buildFix estoura cap dedicado", () => {
  const decision = evaluateChunkLimits(
    { chunkGeneration: 11, buildFixAttempts: MAX_BUILD_FIX_ATTEMPTS },
    new Date().toISOString(),
    Date.now(),
    { buildFix: true },
  );
  assertEquals(decision.exceeded, true);
  assertEquals(decision.reason, "build_fix_cap");
});
