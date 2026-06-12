import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ASSISTANT_TURN_PATH = resolve(
  import.meta.dirname,
  "../../components/chat/AssistantTurn.tsx",
);

/** Garante ordem DOM fixa: Thought → LLM → Mini Card → LLM. */
describe("AssistantTurn — ordem de renderização", () => {
  it("sequência: Thought → Narração → mini-card → fechamento LLM", () => {
    const source = readFileSync(ASSISTANT_TURN_PATH, "utf8");
    const markers = [
      "{showThinking &&",
      "{showNarration &&",
      "{showJobCard &&",
      "forge-chat-closing-line",
      "forge-assistant-turn-toolbar",
    ];
    expect(source).not.toContain("ChatDone");
    expect(source).not.toContain("ChatQualify");
    expect(source).not.toContain("ChatError");
    const indices = markers.map((m) => source.indexOf(m));
    for (const idx of indices) {
      expect(idx).toBeGreaterThan(-1);
    }
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });
});