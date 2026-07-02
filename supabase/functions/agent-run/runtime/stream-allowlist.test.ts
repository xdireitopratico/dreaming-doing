import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AGENT_STREAM_EVENT_TYPES,
  FORBIDDEN_STREAM_EVENT_TYPES,
  type AgentStreamEventType,
} from "../../_shared/agent-contract-events.ts";

Deno.test("stream allowlist — tipos §6.2 ausentes do contrato canônico", () => {
  const canonical = new Set(AGENT_STREAM_EVENT_TYPES);
  for (const forbidden of FORBIDDEN_STREAM_EVENT_TYPES) {
    assertEquals(
      canonical.has(forbidden as AgentStreamEventType),
      false,
      `tipo proibido ainda no contrato: ${forbidden}`,
    );
  }
});

Deno.test("stream allowlist — run_paused e directive presentes", () => {
  const canonical = new Set(AGENT_STREAM_EVENT_TYPES);
  assertEquals(canonical.has("run_paused"), true);
  assertEquals(canonical.has("directive"), true);
});