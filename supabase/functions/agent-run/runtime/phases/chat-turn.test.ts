import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { DIRECT_CHAT_SYSTEM } from "../../conversational.ts";

Deno.test("DIRECT_CHAT_SYSTEM exportado para chat-turn", () => {
  assertEquals(typeof DIRECT_CHAT_SYSTEM, "string");
  assertEquals(DIRECT_CHAT_SYSTEM.includes("FORGE"), true);
});