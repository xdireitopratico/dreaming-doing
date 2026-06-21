import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatLoopStatus, lastAssistantProse, resolveClosureText } from "./loop-status.ts";
import type { ChatMessage } from "./types.ts";

Deno.test("formatLoopStatus — lote de tools", () => {
  const text = formatLoopStatus({
    kind: "tool_batch",
    tools: [
      { name: "fs_read", arguments: { path: "src/App.tsx" } },
      { name: "fs_write", arguments: { path: "src/Hero.tsx" } },
    ],
    allOk: true,
    step: 2,
    total: 8,
  });
  assertStringIncludes(text!, "Hero");
  assertFalse(text!.includes("passo 2/8"));
});

Deno.test("formatLoopStatus — resume comum não vaza passo interno", () => {
  const text = formatLoopStatus({
    kind: "resume",
    resumeStep: 12,
    total: 70,
  });
  assertEquals(text, null);
});

Deno.test("formatLoopStatus — null sem tools no batch", () => {
  const text = formatLoopStatus({ kind: "tool_batch", tools: [] });
  assertEquals(text, null);
});

Deno.test("formatLoopStatus — build_ok", () => {
  const text = formatLoopStatus({ kind: "build_ok" });
  assertStringIncludes(text!, "Build passou");
});

Deno.test("lastAssistantProse — ignora turnos com tool_calls", () => {
  const messages: ChatMessage[] = [
    {
      role: "assistant",
      content: "Vou criar o hero.",
      tool_calls: [{ id: "1", type: "function", function: { name: "fs_write", arguments: "{}" } }],
    },
    { role: "assistant", content: "Pronto — confere o preview." },
  ];
  assertEquals(lastAssistantProse(messages), "Pronto — confere o preview.");
});

Deno.test("resolveClosureText — usa prosa do agente principal", () => {
  const messages: ChatMessage[] = [
    { role: "assistant", content: "Ficou no App.tsx — abre o preview." },
  ];
  const text = resolveClosureText({
    messages,
    touchedPaths: ["src/App.tsx"],
    userRequest: "landing",
  });
  assertStringIncludes(text, "preview");
});

Deno.test("resolveClosureText — fallback com arquivos tocados", () => {
  const text = resolveClosureText({
    messages: [],
    touchedPaths: ["src/App.tsx", "src/Hero.tsx"],
    userRequest: "landing",
  });
  assertStringIncludes(text, "App.tsx");
  assertStringIncludes(text, "preview");
});
