import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  collapseNarrationBuffer,
  filterLoopAgentProseForChat,
  isDuplicateNarrationChunk,
  isEntendiOpener,
} from "./narration-dedupe.ts";

Deno.test("isEntendiOpener — detecta abertura", () => {
  assertEquals(isEntendiOpener("Entendi: vou ler o arquivo."), true);
  assertEquals(isEntendiOpener("Conferindo build…"), false);
});

Deno.test("isDuplicateNarrationChunk — só um Entendi por buffer", () => {
  const first = "Entendi: vou ler o arquivo atual.";
  assertEquals(isDuplicateNarrationChunk("", first), false);
  assertEquals(
    isDuplicateNarrationChunk(first, "Entendi: vou trocar os ícones."),
    true,
  );
});

Deno.test("filterLoopAgentProseForChat — passo 1 mantém abertura", () => {
  const prose = "Entendi: vou montar a landing.";
  assertEquals(filterLoopAgentProseForChat(prose, { loopStep: 1 }), prose);
});

Deno.test("filterLoopAgentProseForChat — passo 2+ remove Entendi", () => {
  assertEquals(
    filterLoopAgentProseForChat("Entendi: vou corrigir ícones.", { loopStep: 2 }),
    null,
  );
  assertEquals(
    filterLoopAgentProseForChat(
      "Entendi: vou corrigir.\n\nAjustando o hero.",
      { loopStep: 3 },
    ),
    "Ajustando o hero.",
  );
});

Deno.test("filterLoopAgentProseForChat — buildFixResume pula ack no passo 1", () => {
  assertEquals(
    filterLoopAgentProseForChat("Entendi: retomando build.", { loopStep: 1, skipAck: true }),
    null,
  );
});

Deno.test("collapseNarrationBuffer — remove parede Entendi", () => {
  const wall =
    "Entendi: vou ler.\n\nEntendi: vou corrigir.\n\nConferindo se compila…";
  assertEquals(collapseNarrationBuffer(wall), "Entendi: vou ler.\n\nConferindo se compila…");
});