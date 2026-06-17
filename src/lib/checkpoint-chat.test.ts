import { describe, expect, it } from "vitest";
import { checkpointChatText } from "./checkpoint-chat";

describe("checkpointChatText", () => {
  it("usa narração acumulada quando existe", () => {
    expect(checkpointChatText("Entendi: vou corrigir os ícones.", false)).toBe(
      "Entendi: vou corrigir os ícones.",
    );
  });

  it("colapsa parede Entendi no checkpoint", () => {
    expect(
      checkpointChatText("Entendi: A\n\nEntendi: B\n\nRetomando passo 2.", false),
    ).toBe("Entendi: A\n\nRetomando passo 2.");
  });

  it("fallback vazio quando sem narração", () => {
    expect(checkpointChatText("", false)).toBe("");
  });

  it("fallback vazio para whitespace", () => {
    expect(checkpointChatText("  ", true)).toBe("");
  });
});