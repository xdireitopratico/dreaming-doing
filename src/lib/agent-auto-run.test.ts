import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markPendingAgentRun,
  peekPendingAgentRun,
  clearPendingAgentRun,
  hasAutoRunAttempted,
  markAutoRunAttempted,
} from "@/lib/agent-auto-run";

function createSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("agent-auto-run", () => {
  const projectId = "proj-1";
  const conversationId = "conv-1";

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createSessionStorage());
  });

  it("flag de projeto novo dispara uma vez", () => {
    markPendingAgentRun(projectId, conversationId);
    expect(peekPendingAgentRun(projectId, conversationId)).toBe(true);
    markAutoRunAttempted(projectId, conversationId);
    clearPendingAgentRun(projectId);
    expect(peekPendingAgentRun(projectId, conversationId)).toBe(false);
    expect(hasAutoRunAttempted(projectId, conversationId)).toBe(true);
  });
});