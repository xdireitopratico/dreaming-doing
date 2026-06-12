import { describe, expect, it } from "vitest";
import { parseClarifyChoices } from "@/lib/clarify-choices";

const MOBILE_CLARIFY = [
  "Entendi que você quer um app mobile.",
  "",
  "Antes de codar, qual caminho prefere?",
  "",
  "- **Expo (recomendado)** — preview web imediato no FORGE + QR para testar no celular",
  "- **Nativo Kotlin** — build Gradle mais longo; progresso no chat e arquivos, sem iframe bonito",
].join("\n");

describe("parseClarifyChoices", () => {
  it("extrai opções Expo/Kotlin da mensagem mobile", () => {
    const parsed = parseClarifyChoices(MOBILE_CLARIFY);
    expect(parsed?.choices.length).toBeGreaterThanOrEqual(2);
    expect(parsed?.choices.some((c) => /expo/i.test(c.label))).toBe(true);
    expect(parsed?.choices.some((c) => /kotlin/i.test(c.label))).toBe(true);
    expect(parsed?.intro).toMatch(/app mobile/i);
  });

  it("retorna null sem opções suficientes", () => {
    expect(parseClarifyChoices("Só uma pergunta aberta?")).toBeNull();
  });
});