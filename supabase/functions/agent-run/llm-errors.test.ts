import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  friendlyLlmError,
  isConnectionError,
  isTimeoutError,
} from "./llm-errors.ts";

Deno.test("isTimeoutError — detecta timeout do llm-chat", () => {
  assertEquals(isTimeoutError(new Error("LLM chat timeout after 180s")), true);
  assertEquals(isTimeoutError(new Error("request timed out")), true);
});

Deno.test("isConnectionError — não classifica timeout como conexão", () => {
  assertEquals(isConnectionError(new Error("LLM chat timeout after 90s")), false);
  assertEquals(isConnectionError(new Error("fetch failed")), true);
});

Deno.test("friendlyLlmError — timeout tem mensagem honesta", () => {
  const msg = friendlyLlmError(new Error("LLM chat timeout after 90s"), false);
  assertEquals(msg.includes("demorou demais"), true);
  assertEquals(msg.includes("Conexão"), false);
});