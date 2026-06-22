import { describe, expect, it } from "vitest";
import {
  applyAgentProgressEvent,
  initialAgentProgress,
  type SSEEvent,
} from "@/lib/agent-progress";
import { resolveTurnThinking } from "@/lib/chat/turn-display";

function ev(type: string, data: Record<string, unknown>, ts = Date.now()): SSEEvent {
  return { type, data, timestamp: ts };
}

describe("resolveTurnThinking", () => {
  it("retorna null sem timeline", () => {
    expect(resolveTurnThinking(initialAgentProgress, true)).toBeNull();
  });

  it("thinking_text ativo vira thought streaming", () => {
    const now = Date.now();
    let progress = applyAgentProgressEvent(
      initialAgentProgress,
      ev("thinking_text", { text: "Vou analisar ", append: true, delta: true }, now - 400),
    );
    progress = applyAgentProgressEvent(
      progress,
      ev("thinking_text", { text: "as dependências.", append: true, delta: true }, now - 200),
    );

    const thought = resolveTurnThinking(progress, true);
    expect(thought?.status).toBe("active");
    if (thought?.status === "active") {
      expect(thought.text).toContain("dependências");
    }
  });

  it("legado assistant_text thinking vira thought quando run termina", () => {
    let progress = applyAgentProgressEvent(
      initialAgentProgress,
      ev("assistant_text", { text: "Raciocínio ", thinking: true, append: true, delta: true }, 100),
    );
    progress = applyAgentProgressEvent(
      progress,
      ev("assistant_text", { text: "completo.", thinking: true, append: true, delta: true }, 300),
    );
    progress = applyAgentProgressEvent(
      progress,
      ev("assistant_text", { text: "Abertura.", opening: true }, 500),
    );

    const thought = resolveTurnThinking(progress, false);
    expect(thought?.status).toBe("done");
    if (thought?.status === "done") {
      expect(thought.durationSec).toBeGreaterThanOrEqual(1);
      expect(thought.text).toContain("Raciocínio");
    }
  });
});