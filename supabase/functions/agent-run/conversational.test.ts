import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isConversationalTurn, isConversationalTurnEarly } from "./conversational.ts";
import type { ClassificationResult } from "./types.ts";

const otherNoBuild: ClassificationResult = {
  complexity: 1,
  type: "other",
  summary: "Cumprimento",
  needsBuild: false,
  needsDeps: false,
};

const modifyBuild: ClassificationResult = {
  complexity: 3,
  type: "modify",
  summary: "Landing",
  needsBuild: true,
  needsDeps: false,
};

Deno.test("isConversationalTurnEarly — bom dia", () => {
  assertEquals(isConversationalTurnEarly("bom dia"), true);
  assertEquals(isConversationalTurnEarly("  Olá!  "), true);
});

Deno.test("isConversationalTurnEarly — pedido técnico é false", () => {
  assertEquals(isConversationalTurnEarly("crie uma landing"), false);
});

Deno.test("isConversationalTurn — só social explícito", () => {
  assertEquals(isConversationalTurn("só passando", otherNoBuild), false);
  assertEquals(isConversationalTurn("crie uma landing", otherNoBuild), false);
  assertEquals(isConversationalTurn("bom dia", modifyBuild), true);
});
