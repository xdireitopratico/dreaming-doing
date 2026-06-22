import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveLoopOriginalUserRequest,
  resolveMaxStepsLimit,
  resolveSkipConversationalGate,
} from "./loop-init.ts";

Deno.test("resolveLoopOriginalUserRequest — planSummary em build aprovado", () => {
  const req = resolveLoopOriginalUserRequest(
    [{ role: "user", content: "crie app" }],
    { approvedPlanBuild: true, planSummary: "# Plano\nPasso 1" },
  );
  assertEquals(req, "# Plano\nPasso 1");
});

Deno.test("resolveMaxStepsLimit — checkpoint vence default", () => {
  assertEquals(resolveMaxStepsLimit({ maxSteps: 20, maxStepsFromCheckpoint: 40 }), 40);
  assertEquals(resolveMaxStepsLimit({ maxSteps: 20 }), 20);
});

Deno.test("resolveSkipConversationalGate — approvedPlanBuild default true", () => {
  assertEquals(resolveSkipConversationalGate({ approvedPlanBuild: true }), true);
  assertEquals(resolveSkipConversationalGate({}), false);
});