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

  it("preserva desenho ASCII em fence sem linguagem", () => {
    const raw = "Layout:\n```\n┌────┐\n│hero│\n└────┘\n```\nFim.";
    const out = sanitizeChatProseForDisplay(raw)!;
    expect(out).toContain("┌────┐");
    expect(out).toContain("│hero│");
  });

  it("preserva mermaid e wireframe", () => {
    const raw = [
      "Proposta de layout:",
      "```mermaid",
      "flowchart TB",
      "  Hero --> Menu",
      "```",
      "```wireframe",
      "+------+",
      "| Hero |",
      "+------+",
      "```",
    ].join("\n");
    const out = sanitizeChatProseForDisplay(raw)!;
    expect(out).toContain("```mermaid");
    expect(out).toContain("Hero --> Menu");
    expect(out).toContain("```wireframe");
    expect(out).toContain("| Hero |");
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