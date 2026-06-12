import { describe, expect, it } from "vitest";
import { resolveClosingProse } from "@/lib/chat/stream-prose";

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