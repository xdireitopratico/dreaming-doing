import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assistantContentForHistory,
  decideToolProgress,
  MAX_TOOL_MISSES,
  TOOL_FAIL_USER_MESSAGE,
} from "./tool-progress.ts";

Deno.test("decideToolProgress — ok com tool_calls", () => {
  assertEquals(decideToolProgress({ hasToolCalls: true, missCount: 0 }).kind, "ok");
});

Deno.test("decideToolProgress — retry sem assistantText quando streamed", () => {
  const d = decideToolProgress({ hasToolCalls: false, missCount: 0, wasStreamed: true });
  assertEquals(d.kind, "retry");
  if (d.kind === "retry") {
    assertEquals(d.attempt, 1);
    assertEquals(d.forceToolsNext, false);
    assert(d.exploreMessage.includes("raciocínio sem ação"));
  }
});

Deno.test("decideToolProgress — forceTools na 2ª tentativa", () => {
  const d = decideToolProgress({ hasToolCalls: false, missCount: 1, wasStreamed: true });
  assertEquals(d.kind, "retry");
  if (d.kind === "retry") {
    assertEquals(d.attempt, 2);
    assertEquals(d.forceToolsNext, true);
  }
});

Deno.test("decideToolProgress — fail na 3ª", () => {
  const d = decideToolProgress({ hasToolCalls: false, missCount: MAX_TOOL_MISSES - 1 });
  assertEquals(d.kind, "fail");
  if (d.kind === "fail") {
    assertEquals(d.userMessage, TOOL_FAIL_USER_MESSAGE);
  }
});

Deno.test("assistantContentForHistory — streamed vazio usa placeholder", () => {
  assertEquals(
    assistantContentForHistory("", "", "", true),
    "[raciocínio interno sem ferramentas]",
  );
});