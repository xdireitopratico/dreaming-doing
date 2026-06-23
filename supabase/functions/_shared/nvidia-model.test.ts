import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeNimBaseUrl, normalizeNvidiaApiModel } from "./nvidia-model.ts";

Deno.test("normalizeNvidiaApiModel — ultra sem -a55b", () => {
  assertEquals(
    normalizeNvidiaApiModel("nvidia/nemotron-3-ultra-550b"),
    "nvidia/nemotron-3-ultra-550b-a55b",
  );
});

Deno.test("normalizeNvidiaApiModel — super sem -a12b", () => {
  assertEquals(
    normalizeNvidiaApiModel("nvidia/nemotron-3-super-120b"),
    "nvidia/nemotron-3-super-120b-a12b",
  );
});

Deno.test("normalizeNvidiaApiModel — já canônico", () => {
  assertEquals(
    normalizeNvidiaApiModel("nvidia/nemotron-3-ultra-550b-a55b"),
    "nvidia/nemotron-3-ultra-550b-a55b",
  );
});

Deno.test("normalizeNimBaseUrl — remove chat/completions duplicado", () => {
  assertEquals(
    normalizeNimBaseUrl("https://integrate.api.nvidia.com/v1/chat/completions"),
    "https://integrate.api.nvidia.com/v1",
  );
});

Deno.test("normalizeNimBaseUrl — adiciona /v1 se ausente", () => {
  assertEquals(
    normalizeNimBaseUrl("https://integrate.api.nvidia.com"),
    "https://integrate.api.nvidia.com/v1",
  );
});