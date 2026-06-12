import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ASSISTANT_TURN_PATH = resolve(
  import.meta.dirname,
  "../../components/chat/AssistantTurn.tsx",
);

/** Garante ordem DOM Lovable fixa no orquestrador (plan.md §2). */
describe("AssistantTurn — ordem de renderização", () => {
  it("sequência: Thought → Narração → chips → mini-card → Done → prose", () => {
    const source = readFileSync(ASSISTANT_TURN_PATH, "utf8");
    const markers = [
      "{showThinking &&",
      "{showNarration &&",
      "forge-status-chips",
      "{showJobCard &&",
      "{showDone &&",
      "forge-chat-closing-line",
    ];
    const indices = markers.map((m) => source.indexOf(m));
    for (const idx of indices) {
      expect(idx).toBeGreaterThan(-1);
    }
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });
});