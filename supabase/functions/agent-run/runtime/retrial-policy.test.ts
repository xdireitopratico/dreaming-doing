import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLlmLoopRetrial } from "./retrial-policy.ts";

Deno.test("classifyLlmLoopRetrial — timeout in-loop na primeira vez", () => {
  assertEquals(
    classifyLlmLoopRetrial({
      err: new Error("timeout"),
      loopAttempts: 0,
      maxLoopAttempts: 3,
      timedOut: true,
      timeoutRetriedThisStep: false,
    }),
    "in_loop",
  );
});

Deno.test("classifyLlmLoopRetrial — in_loop enquanto budget disponível", () => {
  assertEquals(
    classifyLlmLoopRetrial({
      err: new Error("503"),
      loopAttempts: 1,
      maxLoopAttempts: 3,
      timedOut: false,
      timeoutRetriedThisStep: false,
    }),
    "in_loop",
  );
});

Deno.test("classifyLlmLoopRetrial — await_user quando budget esgotado", () => {
  assertEquals(
    classifyLlmLoopRetrial({
      err: new Error("503"),
      loopAttempts: 3,
      maxLoopAttempts: 3,
      timedOut: false,
      timeoutRetriedThisStep: false,
    }),
    "await_user",
  );
});