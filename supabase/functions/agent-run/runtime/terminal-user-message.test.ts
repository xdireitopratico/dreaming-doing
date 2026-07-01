import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ensureUserMessage } from "./terminal-user-message.ts";
import type { ChatMessage } from "../types.ts";

Deno.test("ensureUserMessage — histórico vazio retorna fallback não-vazio", () => {
  const text = ensureUserMessage([], [], "criar landing page");
  assertEquals(text.trim().length > 0, true);
  assertEquals(text.includes("criar landing page"), true);
});

Deno.test("ensureUserMessage — usa última prosa do assistant", () => {
  const messages: ChatMessage[] = [
    { role: "assistant", content: "Vou ajustar o header do site agora." },
  ];
  const text = ensureUserMessage(messages, ["src/Header.tsx"], "ajustar header");
  assertEquals(text, "Vou ajustar o header do site agora.");
});

Deno.test("ensureUserMessage — ignora assistant com tool_calls", () => {
  const messages: ChatMessage[] = [
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "1", type: "function", function: { name: "fs_read", arguments: "{}" } }],
    },
  ];
  const text = ensureUserMessage(messages, ["src/App.tsx"], "ler projeto");
  assertEquals(text.trim().length > 0, true);
  assertEquals(text.includes("1 arquivo"), true);
});

Deno.test("ensureUserMessage — errorMessage produz texto user-facing", () => {
  const text = ensureUserMessage([], [], "teste", "rate limit");
  assertEquals(text.includes("rate limit"), true);
  assertEquals(text.includes("O modelo não respondeu"), false);
});