import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  agentRuntimeV2ShadowEnabled,
  enqueueAgentJobOnDispatch,
  leaseQueuedAgentJob,
} from "./agent-jobs.ts";

Deno.test("agentRuntimeV2ShadowEnabled — off sem env", () => {
  const prev = Deno.env.get("AGENT_RUNTIME_V2");
  try {
    Deno.env.delete("AGENT_RUNTIME_V2");
    assertEquals(agentRuntimeV2ShadowEnabled(), false);
  } finally {
    if (prev != null) Deno.env.set("AGENT_RUNTIME_V2", prev);
    else Deno.env.delete("AGENT_RUNTIME_V2");
  }
});

Deno.test("enqueueAgentJobOnDispatch — noop quando shadow off", async () => {
  const prev = Deno.env.get("AGENT_RUNTIME_V2");
  try {
    Deno.env.delete("AGENT_RUNTIME_V2");
    const gen = await enqueueAgentJobOnDispatch({} as never, "run-1", { planMode: true });
    assertEquals(gen, null);
  } finally {
    if (prev != null) Deno.env.set("AGENT_RUNTIME_V2", prev);
    else Deno.env.delete("AGENT_RUNTIME_V2");
  }
});

Deno.test("leaseQueuedAgentJob — noop quando shadow off", async () => {
  const prev = Deno.env.get("AGENT_RUNTIME_V2");
  try {
    Deno.env.delete("AGENT_RUNTIME_V2");
    const gen = await leaseQueuedAgentJob({} as never, "run-1");
    assertEquals(gen, null);
  } finally {
    if (prev != null) Deno.env.set("AGENT_RUNTIME_V2", prev);
    else Deno.env.delete("AGENT_RUNTIME_V2");
  }
});