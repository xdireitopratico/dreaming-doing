import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizePresetId } from "./preset-contract.ts";
import { getPresetWire, resolveUserRobinModel } from "./model-presets.ts";

Deno.test("normalizePresetId — slug API NVIDIA → preset catálogo (não Taste)", () => {
  assertEquals(
    normalizePresetId("nvidia/nemotron-3-ultra-550b-a55b"),
    "nvidia--nemotron-3-ultra-550b",
  );
  assertEquals(getPresetWire("nvidia/nemotron-3-ultra-550b-a55b")?.model, "nvidia/nemotron-3-ultra-550b-a55b");
});

Deno.test("normalizePresetId — Nemotron Super usa sufixo -a12b no wire", () => {
  const wire = getPresetWire("nvidia--nemotron-3-super-120b");
  assertEquals(wire?.model, "nvidia/nemotron-3-super-120b-a12b");
});

Deno.test("normalizePresetId — slug API Super 120B sem -a12b", () => {
  assertEquals(normalizePresetId("nvidia/nemotron-3-super-120b"), "nvidia--nemotron-3-super-120b");
  assertEquals(getPresetWire("nvidia/nemotron-3-super-120b")?.model, "nvidia/nemotron-3-super-120b-a12b");
});

Deno.test("normalizePresetId — pool-nemotron-super aponta para Super 120B", () => {
  assertEquals(normalizePresetId("pool-nemotron-super"), "nvidia--nemotron-3-super-120b");
});

Deno.test("normalizePresetId — qwen NVIDIA legado", () => {
  assertEquals(normalizePresetId("nvidia/qwen3.5-397b-a17b"), "qwen--qwen3-5-397b-a17b");
});

Deno.test("resolveUserRobinModel — fail-closed sem robinPoolModelId", () => {
  let threw = false;
  try {
    resolveUserRobinModel(undefined);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message.includes("ROBIN"), true);
  }
  assertEquals(threw, true);
});