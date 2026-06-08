import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/components/editor/ChatInput";
import {
  isAgentJobMessage,
  progressFromAssistantMessage,
  runIdFromAssistantMessage,
} from "@/lib/assistant-run-progress";

describe("assistant-run-progress", () => {
  it("detecta job por meta.runId", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Pronto!",
      timestamp: 0,
      meta: { runId: "run-1", finishedAt: "2026-01-01T00:00:00Z" },
    };
    expect(runIdFromAssistantMessage(msg)).toBe("run-1");
    expect(isAgentJobMessage(msg)).toBe(true);
  });

  it("reidrata progresso finished para mini-card histórico", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Landing criada.",
      timestamp: 0,
      meta: {
        runId: "run-1",
        finishedAt: "2026-01-01T00:00:00Z",
        deliveryFiles: ["src/App.tsx"],
        currentStep: 3,
        totalSteps: 5,
      },
      toolCalls: [{ name: "fs_write", args: "src/App.tsx" }],
    };
    const p = progressFromAssistantMessage(msg);
    expect(p?.finished).toBe(true);
    expect(p?.lastFinishOk).toBe(true);
    expect(p?.deliveryFiles).toEqual(["src/App.tsx"]);
    expect(p?.tools).toHaveLength(1);
    expect(p?.currentStep).toBe(3);
  });

  it("mensagem concierge sem runId não é job", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Olá!",
      timestamp: 0,
    };
    expect(isAgentJobMessage(msg)).toBe(false);
    expect(progressFromAssistantMessage(msg)).toBeNull();
  });
});