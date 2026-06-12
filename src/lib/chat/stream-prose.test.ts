import { describe, expect, it } from "vitest";
import { normalizeRepeatedEmojis, resolveClosingProse } from "@/lib/chat/stream-prose";

describe("normalizeRepeatedEmojis", () => {
  it("colapsa o mesmo emoji repetido", () => {
    expect(normalizeRepeatedEmojis("Vou começar 🙂 🙂 🙂 pelo hero.")).toBe(
      "Vou começar 🙂 pelo hero.",
    );
  });

  it("mantém emojis distintos", () => {
    expect(normalizeRepeatedEmojis("Feito ✅ — confira o preview 🎉")).toBe(
      "Feito ✅ — confira o preview 🎉",
    );
  });
});

describe("resolveClosingProse", () => {
  it("remove fechamento idêntico à narração", () => {
    expect(resolveClosingProse("Olá mundo", "Olá mundo")).toBeNull();
  });

  it("mantém fechamento distinto", () => {
    expect(resolveClosingProse("Vou começar pelo hero.", "Pronto — confira o preview.")).toBe(
      "Pronto — confira o preview.",
    );
  });
});