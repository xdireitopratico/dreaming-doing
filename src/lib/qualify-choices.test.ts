import { describe, expect, it } from "vitest";
import { parseQualifyChoices } from "@/lib/qualify-choices";

const MOBILE_QUALIFY = [
  "Entendi que você quer um app mobile.",
  "",
  "Antes de codar, qual caminho prefere?",
  "",
  "- **Expo (recomendado)** — preview web imediato no FORGE + QR para testar no celular",
  "- **Nativo Kotlin** — build Gradle mais longo; progresso no chat e arquivos, sem iframe bonito",
].join("\n");

describe("parseQualifyChoices", () => {
  it("extrai opções Expo/Kotlin da mensagem mobile", () => {
    const parsed = parseQualifyChoices(MOBILE_QUALIFY);
    expect(parsed?.choices.length).toBeGreaterThanOrEqual(2);
    expect(parsed?.choices.some((c) => /expo/i.test(c.label))).toBe(true);
    expect(parsed?.choices.some((c) => /kotlin/i.test(c.label))).toBe(true);
    expect(parsed?.intro).toMatch(/app mobile/i);
  });

  it("retorna null sem opções suficientes", () => {
    expect(parseQualifyChoices("Só uma pergunta aberta?")).toBeNull();
  });
});
