import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeMessagesForAnthropic } from "./anthropic-messages.ts";

Deno.test("normalizeMessagesForAnthropic — tool result vira user tool_result", () => {
  const out = normalizeMessagesForAnthropic([
    {
      role: "assistant",
      content: "ok",
      tool_calls: [{ id: "tc1", type: "function", function: { name: "read_file", arguments: "{}" } }],
    },
    { role: "tool", tool_call_id: "tc1", content: "file contents" },
    { role: "user", content: "continue" },
  ]);
  assertEquals(out[1]?.role, "user");
  const block = Array.isArray(out[1]?.content) ? out[1]!.content[0] : null;
  assertEquals(block?.type, "tool_result");
  assertEquals((block as { tool_use_id: string }).tool_use_id, "tc1");
});

Deno.test("normalizeMessagesForAnthropic — nunca emite role tool", () => {
  const out = normalizeMessagesForAnthropic([
    { role: "user", content: "hi" },
    { role: "tool", tool_call_id: "x", content: "done" },
  ]);
  assertEquals(out.every((m) => m.role === "user" || m.role === "assistant"), true);
});