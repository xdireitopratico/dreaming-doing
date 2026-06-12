import { describe, expect, it } from "vitest";
import { isNvidiaNimBaseUrl, normalizeMessagesForNim } from "./nim-messages";

describe("normalizeMessagesForNim", () => {
  it("funde múltiplos system no início (llmChatPlanMode)", () => {
    const out = normalizeMessagesForNim([
      { role: "system", content: "Prompt agente" },
      { role: "system", content: "## Contexto\nmanifest" },
      { role: "user", content: "Reapresenta o plano" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.role).toBe("system");
    expect(out[0]?.content).toContain("Prompt agente");
    expect(out[0]?.content).toContain("## Contexto");
    expect(out[1]?.role).toBe("user");
  });

  it("funde system do histórico comprimido com os do turno", () => {
    const out = normalizeMessagesForNim([
      { role: "system", content: "System A" },
      { role: "system", content: "System B" },
      { role: "system", content: "## Resumo da Conversa Anterior\nfeito X" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "continue" },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]?.role).toBe("system");
    expect(out[0]?.content).toContain("System A");
    expect(out[0]?.content).toContain("Resumo da Conversa");
    expect(out[1]?.role).toBe("assistant");
  });

  it("preserva tool_calls e tool messages", () => {
    const out = normalizeMessagesForNim([
      { role: "system", content: "sys" },
      { role: "assistant", content: "", tool_calls: [{ id: "1" }] },
      { role: "tool", content: "{}", tool_call_id: "1" },
      { role: "user", content: "next" },
    ]);
    expect(out).toHaveLength(4);
    expect(out[1]?.tool_calls).toBeTruthy();
    expect(out[2]?.role).toBe("tool");
  });

  it("retorna inalterado quando não há system", () => {
    const input = [{ role: "user", content: "hi" }];
    expect(normalizeMessagesForNim(input)).toEqual(input);
  });
});

describe("isNvidiaNimBaseUrl", () => {
  it("detecta integrate.api.nvidia.com", () => {
    expect(isNvidiaNimBaseUrl("https://integrate.api.nvidia.com/v1")).toBe(true);
    expect(isNvidiaNimBaseUrl("https://api.openai.com/v1")).toBe(false);
  });
});