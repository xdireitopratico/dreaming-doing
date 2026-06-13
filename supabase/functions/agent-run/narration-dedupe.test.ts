import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  collapseNarrationBuffer,
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

Deno.test("collapseNarrationBuffer — remove parede Entendi", () => {
  const wall =
    "Entendi: vou ler.\n\nEntendi: vou corrigir.\n\nConferindo se compila…";
  assertEquals(collapseNarrationBuffer(wall), "Entendi: vou ler.\n\nConferindo se compila…");
});