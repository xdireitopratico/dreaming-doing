import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isConversationRecallQuestion,
  isConversationalTurn,
  isConversationalTurnEarly,
  runConversationalPhase,
  runDirectChatPhase,
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

Deno.test("runConversationalPhase — fail-close quando LLM falha", async () => {
  const model = {
    chat: async () => {
      throw new Error("provider down");
    },
  };
  await assertRejects(
    () => runConversationalPhase(model, [], { userRequest: "bom dia" }),
    Error,
    "provider down",
  );
});

Deno.test("runConversationalPhase — fail-close quando LLM retorna vazio", async () => {
  const model = {
    chat: async () => ({ role: "assistant" as const, content: "", tool_calls: [] }),
  };
  await assertRejects(
    () => runConversationalPhase(model, [], { userRequest: "bom dia" }),
    Error,
    "conversacional",
  );
});

Deno.test("runDirectChatPhase — fail-close quando LLM retorna vazio", async () => {
  const model = {
    chat: async () => ({ role: "assistant" as const, content: "curto", tool_calls: [] }),
  };
  await assertRejects(
    () => runDirectChatPhase(model, [], { userRequest: "qual paleta?" }),
    Error,
    "chat direto",
  );
});