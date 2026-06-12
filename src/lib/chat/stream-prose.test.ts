import { describe, expect, it } from "vitest";
import {
  normalizeRepeatedEmojis,
  resolveClosingProse,
  sanitizeChatProseForDisplay,
} from "@/lib/chat/stream-prose";

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

describe("sanitizeChatProseForDisplay", () => {
  it("remove fences e paths do seed", () => {
    const raw =
      "Tokens em `src/index.css`:\n```css\n--color-brand-500: #FFB627;\n```\nDark industrial.";
    expect(sanitizeChatProseForDisplay(raw)).toBe("Tokens em :\n\nDark industrial.");
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