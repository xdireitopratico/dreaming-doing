import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const agentBuildSrc = await Deno.readTextFile(
  new URL("../../../../src/inngest/functions/agent-build.ts", import.meta.url),
);
const agentPlanSrc = await Deno.readTextFile(
  new URL("../../../../src/inngest/functions/agent-plan.ts", import.meta.url),
);
const agentChatSrc = await Deno.readTextFile(
  new URL("../../../../src/inngest/functions/agent-chat.ts", import.meta.url),
);
const sharedSrc = await Deno.readTextFile(
  new URL("../../../../src/inngest/functions/_shared.ts", import.meta.url),
);

function assertNoRedispatch(label: string, src: string) {
  assertEquals(src.includes("sendEvent"), false, `${label} ainda contém sendEvent`);
  assertEquals(src.includes("redispatch"), false, `${label} ainda contém redispatch`);
  assertEquals(src.includes("re-dispatch-chunk"), false, `${label} ainda contém re-dispatch-chunk`);
}

Deno.test("no-redispatch — agent-build sem auto-chunk Inngest", () => {
  assertNoRedispatch("agent-build.ts", agentBuildSrc);
});

Deno.test("no-redispatch — agent-plan sem auto-chunk Inngest", () => {
  assertNoRedispatch("agent-plan.ts", agentPlanSrc);
});

Deno.test("no-redispatch — agent-chat sem auto-chunk Inngest", () => {
  assertNoRedispatch("agent-chat.ts", agentChatSrc);
});

Deno.test("no-redispatch — _shared executa loop uma vez", () => {
  assertEquals(sharedSrc.includes("execute-loop-0"), true);
  assertEquals(sharedSrc.includes("runAgentLoopOnce"), true);
});