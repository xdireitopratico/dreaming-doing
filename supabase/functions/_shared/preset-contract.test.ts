import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizePresetId,
  PLATFORM_ROBIN_TASTE_PRESET_ID,
} from "./preset-contract.ts";
import { getPresetWire } from "./model-presets.ts";

Deno.test("normalizePresetId — slug API NVIDIA → pool ROBIN", () => {
  assertEquals(
    normalizePresetId("nvidia/nemotron-3-ultra-550b-a55b"),
    PLATFORM_ROBIN_TASTE_PRESET_ID,
  );
  assertEquals(getPresetWire("nvidia/nemotron-3-ultra-550b-a55b")?.model, "nvidia/nemotron-3-ultra-550b-a55b");
});

Deno.test("normalizePresetId — Nemotron Super usa sufixo -a12b no wire", () => {
  const wire = getPresetWire("nvidia--nemotron-3-super-120b");
  assertEquals(wire?.model, "nvidia/nemotron-3-super-120b-a12b");
});

Deno.test("normalizePresetId — qwen NVIDIA legado", () => {
  assertEquals(normalizePresetId("nvidia/qwen3.5-397b-a17b"), "qwen--qwen3-5-397b-a17b");
});