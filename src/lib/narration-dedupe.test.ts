import { describe, expect, it } from "vitest";
import {
  collapseNarrationBuffer,
  isDuplicateNarrationChunk,
  isEntendiOpener,
} from "./narration-dedupe";

describe("isDuplicateNarrationChunk", () => {
  it("rejeita chunk vazio", () => {
    expect(isDuplicateNarrationChunk("", "")).toBe(true);
  });

  it("aceita primeira narração", () => {
    expect(isDuplicateNarrationChunk("", "Entendi: vou ler o arquivo atual.")).toBe(false);
  });

  it("bloqueia parágrafo idêntico repetido", () => {
    const line = "Entendi: vou ler o arquivo atual para ver onde o código foi cortado.";
    expect(isDuplicateNarrationChunk(line, line)).toBe(true);
  });

  it("bloqueia segundo Entendi com texto diferente", () => {
    const buf = "Entendi: vou rodar o build pra ver o erro específico.";
    expect(isDuplicateNarrationChunk(buf, "Entendi: vou trocar Oil por ícones válidos.")).toBe(
      true,
    );
  });

  it("bloqueia repetição após append anterior (não-Entendi)", () => {
    const a = "Conferindo se o projeto compila antes de seguir.";
    const b = "TypeScript apontou erro — corrigindo.";
    const buf = `${a}\n\n${b}`;
    expect(isDuplicateNarrationChunk(buf, a)).toBe(true);
    expect(isDuplicateNarrationChunk(buf, b)).toBe(true);
  });

  it("permite narração distinta no mesmo turno", () => {
    const buf = "Entendi: vou ler o arquivo atual.";
    expect(isDuplicateNarrationChunk(buf, "Conferindo se o projeto compila…")).toBe(false);
  });
});

describe("collapseNarrationBuffer", () => {
  it("mantém um Entendi e narrações factuais", () => {
    const out = collapseNarrationBuffer(
      "Entendi: A.\n\nEntendi: B.\n\nBuild passou — sigo.",
    );
    expect(out).toBe("Entendi: A.\n\nBuild passou — sigo.");
  });

  it("isEntendiOpener", () => {
    expect(isEntendiOpener("entendi: ok")).toBe(true);
    expect(isEntendiOpener("Pronto.")).toBe(false);
  });
});