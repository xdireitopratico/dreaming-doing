import { describe, expect, it } from "vitest";
import {
  isChatDiagramFence,
  resolveChatFenceRenderKind,
  shouldPreserveChatFence,
  stripNonDiagramFences,
} from "@/lib/chat/diagram-fences";

describe("diagram-fences", () => {
  it("preserva mermaid e wireframe", () => {
    const raw = [
      "Layout proposto:",
      "```mermaid",
      "flowchart TB",
      "  A[Hero] --> B[Cardapio]",
      "```",
      "```wireframe",
      "+--------+",
      "| Header |",
      "+--------+",
      "```",
    ].join("\n");

    const out = stripNonDiagramFences(raw);
    expect(out).toContain("```mermaid");
    expect(out).toContain("flowchart TB");
    expect(out).toContain("```wireframe");
    expect(out).toContain("| Header |");
  });

  it("preserva fence sem linguagem (desenho ASCII típico do LLM)", () => {
    const raw = [
      "Rascunho:",
      "```",
      "┌──────────┐",
      "│  HERO    │",
      "└──────────┘",
      "```",
    ].join("\n");
    const out = stripNonDiagramFences(raw);
    expect(out).toContain("┌──────────┐");
    expect(out).toContain("│  HERO    │");
  });

  it("remove fences de código comuns", () => {
    const raw = "Ver `src/App.tsx`:\n```tsx\nexport default function App() {}\n```\nPronto.";
    const out = stripNonDiagramFences(raw);
    expect(out).not.toContain("export default");
    expect(out).toContain("Pronto.");
  });

  it("isChatDiagramFence", () => {
    expect(isChatDiagramFence("mermaid")).toBe(true);
    expect(isChatDiagramFence("wireframe")).toBe(true);
    expect(isChatDiagramFence("tsx")).toBe(false);
  });

  it("shouldPreserveChatFence", () => {
    expect(shouldPreserveChatFence("")).toBe(true);
    expect(shouldPreserveChatFence("ascii")).toBe(true);
    expect(shouldPreserveChatFence("tsx")).toBe(false);
  });

  it("resolveChatFenceRenderKind", () => {
    expect(resolveChatFenceRenderKind("mermaid")).toBe("mermaid");
    expect(resolveChatFenceRenderKind("wireframe")).toBe("drawing");
    expect(resolveChatFenceRenderKind("")).toBe("drawing");
    expect(resolveChatFenceRenderKind("tsx")).toBe("hidden");
  });
});