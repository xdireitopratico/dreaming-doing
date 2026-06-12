import { describe, expect, it } from "vitest";
import { isDuplicateNarrationChunk } from "./narration-dedupe";

describe("isDuplicateNarrationChunk", () => {
  it("rejeita chunk vazio", () => {
    expect(isDuplicateNarrationChunk("", "")).toBe(true);
  });

  it("aceita primeira narração", () => {
    expect(isDuplicateNarrationChunk("", "Entendi: vou ler o arquivo atual.")).toBe(false);
  });

  it("bloqueia parágrafo idêntico repetido", () => {
    const line = "Entendi: vou ler o arquivo atual para ver onde o código foi cortado.";
    const buf = line;
    expect(isDuplicateNarrationChunk(buf, line)).toBe(true);
  });

  it("bloqueia repetição após append anterior", () => {
    const a = "Entendi: vou rodar o build pra ver o erro específico.";
    const b = "Entendi: vou trocar Oil e Snowflake por ícones válidos.";
    const buf = `${a}\n\n${b}`;
    expect(isDuplicateNarrationChunk(buf, a)).toBe(true);
    expect(isDuplicateNarrationChunk(buf, b)).toBe(true);
  });

  it("permite narração distinta no mesmo turno", () => {
    const buf = "Entendi: vou ler o arquivo atual.";
    expect(isDuplicateNarrationChunk(buf, "Conferindo se o projeto compila…")).toBe(false);
  });
});