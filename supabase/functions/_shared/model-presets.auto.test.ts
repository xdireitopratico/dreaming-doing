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

const AUTO_PRESETS = [
  "anthropic--claude-opus-4-8-fast",
  "anthropic--claude-opus-4-8",
  "openai--gpt-5-4",
];

Deno.test("autoTierSearchOrder — potência sobe com complexidade", () => {
  assertEquals(autoTierSearchOrder(1), ["fast", "balanced", "frontier"]);
  assertEquals(autoTierSearchOrder(2), ["fast", "balanced", "frontier"]);
  assertEquals(autoTierSearchOrder(3), ["balanced", "frontier", "fast"]);
  assertEquals(autoTierSearchOrder(4), ["frontier", "balanced", "fast"]);
  assertEquals(autoTierSearchOrder(5), ["frontier", "balanced", "fast"]);
});

Deno.test("resolveAutoClassifyProvider — prefere tier fast (rank mais alto no fast)", () => {
  const wire = resolveAutoClassifyProvider(KEYS, AUTO_PRESETS);
  assertEquals(wire?.model, "claude-opus-4-8-fast");
});

Deno.test("resolveAutoForComplexity — c1 fast, c5 frontier", () => {
  const light = resolveAutoForComplexity(KEYS, 1, AUTO_PRESETS);
  const heavy = resolveAutoForComplexity(KEYS, 5, AUTO_PRESETS);
  assertEquals(light?.model, "claude-opus-4-8-fast");
  assertEquals(heavy?.model, "claude-opus-4-8");
});

Deno.test("resolveAutoForComplexity — sem modelos configurados falha fechado", () => {
  const wire = resolveAutoForComplexity(KEYS, 3, []);
  assertEquals(wire, null);
});
