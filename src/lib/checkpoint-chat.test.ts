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

  it("fallback para retomada automática", () => {
    expect(checkpointChatText("", false)).toBe("Retomando automaticamente no servidor…");
  });

  it("fallback para build fix", () => {
    expect(checkpointChatText("  ", true)).toBe("Corrigindo erros de build no servidor…");
  });
});