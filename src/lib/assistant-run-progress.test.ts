import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-types";
import {
  hasMaterializedCardSnapshot,
  isAgentJobMessage,
  progressFromAssistantMessage,
  resolveHistoricalRunProgress,
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
        lastFinishOk: true,
        deliveryFiles: ["src/App.tsx"],
        currentStep: 3,
        totalSteps: 5,
        executionLog: ["Edited src/App.tsx"],
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

  it("cardSnapshot materializado reidrata timeline, tools e diffs completos", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Landing criada.",
      timestamp: 0,
      meta: {
        runId: "run-1",
        partial: false,
        finishedAt: "2026-01-01T00:00:00Z",
        cardSnapshot: {
          timeline: [
            {
              type: "tool_start",
              data: { name: "fs_write", args: { path: "src/App.tsx" } },
              timestamp: 1,
            },
            {
              type: "file_diff",
              data: { path: "src/App.tsx", before: "", after: "x", op: "write" },
              timestamp: 2,
            },
          ],
          tools: [{ name: "fs_write", args: { path: "src/App.tsx" }, ok: true }],
          diffs: [
            {
              id: "src/App.tsx::0::2",
              path: "src/App.tsx",
              before: "",
              after: "x",
              op: "write",
              timestamp: 2,
            },
          ],
          streamText: "Landing criada com hero.",
          finished: true,
          lastFinishOk: true,
          deliveryFiles: ["src/App.tsx"],
          currentStep: 3,
          totalSteps: 5,
          phase: "done",
        },
      },
    };
    expect(hasMaterializedCardSnapshot(msg)).toBe(true);
    const p = progressFromAssistantMessage(msg);
    expect(p?.timeline).toHaveLength(2);
    expect(p?.tools).toHaveLength(1);
    expect(p?.diffs).toHaveLength(1);
    expect(p?.streamText).toBe("Landing criada com hero.");
    expect(p?.deliveryFiles).toEqual(["src/App.tsx"]);
  });

  it("cardSnapshot com awaitingKind qualify (clarify) restaura gate pós-F5", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Qual estilo visual?",
      timestamp: 0,
      meta: {
        runId: "run-q",
        partial: false,
        finishedAt: "2026-01-01T00:00:00Z",
        cardSnapshot: {
          streamText: "Qual estilo visual?",
          finished: true,
          awaiting: true,
          awaitingKind: "qualify",
          timeline: [],
          tools: [],
          diffs: [],
          deliveryFiles: [],
        },
      },
    };
    const p = progressFromAssistantMessage(msg);
    expect(p?.awaiting).toBe(true);
    expect(p?.awaitingKind).toBe("qualify");
  });

  it("resolveHistoricalRunProgress busca run no histórico DB", () => {
    const msg: ChatMessage = {
      id: "a1",
      role: "assistant",
      content: "Feito.",
      timestamp: 0,
      meta: { runId: "run-hist", finishedAt: "2026-01-01T00:00:00Z", lastFinishOk: true },
    };
    const p = resolveHistoricalRunProgress("run-hist", [msg]);
    expect(p?.finished).toBe(true);
    expect(p?.streamText).toBe("Feito.");
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
