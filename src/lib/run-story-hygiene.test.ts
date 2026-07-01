// run-story-hygiene.test.ts — regressão: padrões internos não devem
// filtrar texto legítimo de user. Em particular, o usuário pode
// mencionar "passo 3 de 4" no chat sem que isso seja jargão interno.

import { describe, expect, it } from "vitest";
import { isInternalRunEvent, isInternalRunText, sanitizeRunText } from "./run-story-hygiene";

describe("run-story-hygiene", () => {
  describe("internal text patterns", () => {
    it("filters internal jargon", () => {
      expect(isInternalRunText("Checkpoint: 50 mensagens, fase execute_step")).toBe(true);
      expect(isInternalRunText("Continuando (parte 2/12)…")).toBe(true);
      expect(isInternalRunText("Trabalhando no pedido…")).toBe(true);
      expect(isInternalRunText("Checkpoint, 0 arquivos")).toBe(true);
    });

    it("does NOT filter legitimate user text", () => {
      expect(isInternalRunText("fiz o passo 3 de 4 agora falta o último")).toBe(false);
      expect(isInternalRunText("meu projeto tem 5 passos")).toBe(false);
      expect(isInternalRunText("Hello, how are you?")).toBe(false);
    });
  });

  describe("sanitizeRunText", () => {
    it("returns null for internal jargon", () => {
      expect(sanitizeRunText("Checkpoint: 50 mensagens, fase execute_step")).toBeNull();
      expect(sanitizeRunText("Trabalhando no pedido…")).toBeNull();
    });

    it("preserves legitimate user text", () => {
      expect(sanitizeRunText("fiz o passo 3 de 4")).toBe("fiz o passo 3 de 4");
      expect(sanitizeRunText("Hello world")).toBe("Hello world");
    });

    it("truncates long text", () => {
      const long = "a".repeat(200);
      const out = sanitizeRunText(long, 50);
      expect(out?.length).toBeLessThanOrEqual(50);
    });
  });

  describe("internal event types", () => {
    it("filters assistant_text e chunk_resume da timeline factual", () => {
      expect(isInternalRunEvent("assistant_text", { text: "Pensando…" })).toBe(true);
      expect(isInternalRunEvent("chunk_resume", { attempt: 2, reason: "budget" })).toBe(true);
    });
  });
});
