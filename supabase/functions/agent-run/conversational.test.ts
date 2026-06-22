import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isAdvisoryQuestion,
  isConversationRecallQuestion,
  isConversationalTurn,
  isConversationalTurnEarly,
  runAdvisoryPhase,
  runConversationalPhase,
} from "./conversational.ts";

Deno.test("isConversationalTurnEarly — cumprimentos sociais", () => {
  assertEquals(isConversationalTurnEarly("bom dia"), true);
  assertEquals(isConversationalTurnEarly("  Olá!  "), true);
  assertEquals(isConversationalTurnEarly("valeu!"), true);
});

Deno.test("isConversationalTurnEarly — pedido técnico é false", () => {
  assertEquals(isConversationalTurnEarly("crie uma landing"), false);
});

Deno.test("isConversationRecallQuestion — memória do histórico", () => {
  assertEquals(isConversationRecallQuestion("você lembra do que conversamos?"), true);
  assertEquals(isConversationRecallQuestion("Lembra qual era o assunto no início?"), true);
  assertEquals(isConversationRecallQuestion("do you remember what we talked about?"), true);
  assertEquals(isConversationRecallQuestion("crie uma landing de padaria"), false);
});

Deno.test("isConversationalTurnEarly — recall é social", () => {
  assertEquals(isConversationalTurnEarly("você lembra do que falamos?"), true);
});

Deno.test("isConversationalTurn — alias de early exit social", () => {
  assertEquals(isConversationalTurn("só passando"), false);
  assertEquals(isConversationalTurn("crie uma landing"), false);
  assertEquals(isConversationalTurn("bom dia"), true);
  assertEquals(isConversationalTurn("você lembra do que conversamos?"), true);
});

Deno.test("isAdvisoryQuestion — paleta e sugestões sem implementação", () => {
  assertEquals(isAdvisoryQuestion("qual paleta de cor você sugere?"), true);
  assertEquals(isAdvisoryQuestion("o que você acha desse layout?"), true);
  assertEquals(isAdvisoryQuestion("crie uma landing com paleta azul"), false);
  assertEquals(isAdvisoryQuestion("implemente o tema dark"), false);
});

Deno.test("runConversationalPhase — fallback PT quando LLM falha", async () => {
  const model = {
    chat: async () => {
      throw new Error("provider down");
    },
  };
  const text = await runConversationalPhase(model, [], { userRequest: "bom dia" });
  assertEquals(text.includes("ajudar"), true);
});

Deno.test("runAdvisoryPhase — fallback PT quando LLM retorna vazio", async () => {
  const model = {
    chat: async () => ({ content: "" }),
  };
  const text = await runAdvisoryPhase(model, [], { userRequest: "qual paleta?" });
  assertEquals(text.includes("direção"), true);
});