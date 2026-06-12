import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildClosureMessage,
  buildLoopUpdate,
  buildOpeningMessage,
} from "./narration.ts";

Deno.test("buildOpeningMessage — interação humana no build", () => {
  const text = buildOpeningMessage({
    userSummary: "uma landing de cafeteria com hero e cardápio",
    intentType: "new_project",
    planMode: false,
  });
  assertStringIncludes(text, "landing de cafeteria");
  assertStringIncludes(text, "montar isso do zero");
  assertEquals(text.includes("Caminho previsto"), false);
  assertEquals(text.includes("**Passo"), false);
});

Deno.test("buildOpeningMessage — plan mode", () => {
  const text = buildOpeningMessage({
    userSummary: "app de delivery",
    planMode: true,
  });
  assertStringIncludes(text, "plano passo a passo");
  assertStringIncludes(text, "inspector");
});

Deno.test("buildOpeningMessage — plano aprovado", () => {
  const text = buildOpeningMessage({
    userSummary: "x",
    approvedPlan: true,
    planHeadline: "Landing da padaria",
  });
  assertStringIncludes(text, "Landing da padaria");
  assertStringIncludes(text, "executar");
});

Deno.test("buildLoopUpdate — lote de tools em linguagem humana", () => {
  const text = buildLoopUpdate({
    kind: "tool_batch",
    tools: [
      { name: "fs_read", arguments: { path: "src/App.tsx" } },
      { name: "fs_write", arguments: { path: "src/Hero.tsx" } },
    ],
    allOk: true,
  });
  assertStringIncludes(text!, "src/App.tsx");
  assertStringIncludes(text!, "src/Hero.tsx");
  assertEquals(text!.includes("Passo 1/5"), false);
});

Deno.test("buildLoopUpdate — typecheck e build", () => {
  assertStringIncludes(
    buildLoopUpdate({ kind: "typecheck_fail" })!,
    "TypeScript",
  );
  assertStringIncludes(
    buildLoopUpdate({ kind: "build_ok" })!,
    "Build passou",
  );
});

Deno.test("buildClosureMessage — entrega com expectativa", () => {
  const resolved = buildClosureMessage({
    touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
    priorConversation: "Montei o hero e liguei no App.",
  });
  assertEquals(resolved.emitExtra, true);
  assertStringIncludes(resolved.text, "preview");
  assertStringIncludes(resolved.text, "src/App.tsx");
  assertEquals(resolved.text.includes("Pronto! Resumo"), false);
});

Deno.test("buildClosureMessage — conversa pura sem arquivos", () => {
  const answer =
    "Nesta plataforma o Expo costuma rodar melhor — quer que eu suba o scaffold?";
  const resolved = buildClosureMessage({
    touchedPaths: [],
    priorConversation: answer,
  });
  assertEquals(resolved.text, answer);
  assertEquals(resolved.emitExtra, false);
});