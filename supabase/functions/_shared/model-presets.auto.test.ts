import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  autoTierSearchOrder,
  resolveAutoClassifyProvider,
  resolveAutoForComplexity,
} from "./model-presets.ts";

const KEYS = {
  ANTHROPIC_API_KEY: "sk-ant",
  OPENAI_API_KEY: "sk-openai",
  GROQ_API_KEY: "gsk",
};

Deno.test("autoTierSearchOrder — potência sobe com complexidade", () => {
  assertEquals(autoTierSearchOrder(1), ["fast", "balanced", "frontier"]);
  assertEquals(autoTierSearchOrder(2), ["fast", "balanced", "frontier"]);
  assertEquals(autoTierSearchOrder(3), ["balanced", "frontier", "fast"]);
  assertEquals(autoTierSearchOrder(4), ["frontier", "balanced", "fast"]);
  assertEquals(autoTierSearchOrder(5), ["frontier", "balanced", "fast"]);
});

Deno.test("resolveAutoClassifyProvider — prefere tier fast (rank mais alto no fast)", () => {
  const wire = resolveAutoClassifyProvider(KEYS);
  assertEquals(wire?.model, "claude-opus-4-8-fast");
});

Deno.test("resolveAutoForComplexity — c1 fast, c5 frontier", () => {
  const light = resolveAutoForComplexity(KEYS, 1);
  const heavy = resolveAutoForComplexity(KEYS, 5);
  assertEquals(light?.model, "claude-opus-4-8-fast");
  assertEquals(heavy?.model, "claude-opus-4-8");
});