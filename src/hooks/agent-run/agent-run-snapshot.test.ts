import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProgress } from "@/lib/agent-progress";
import { initialAgentProgress } from "@/lib/agent-progress";
import {
  clearAgentSnapshot,
  loadAgentSnapshot,
  saveAgentSnapshot,
  SESSION_STORAGE_KEY,
  SNAPSHOT_MAX_AGE_MS,
} from "@/hooks/agent-run/agent-run-snapshot";

const progress: AgentProgress = {
  ...initialAgentProgress,
  statusHint: "test",
};

function mockSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
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
  });
}

describe("agent-run-snapshot", () => {
  beforeEach(() => {
    mockSessionStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("save + load round-trip", () => {
    saveAgentSnapshot({
      projectId: "p1",
      conversationId: "c1",
      activeRunId: "run-1",
      lastSeq: 5,
      progress,
    });
    const snap = loadAgentSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.projectId).toBe("p1");
    expect(snap!.conversationId).toBe("c1");
    expect(snap!.activeRunId).toBe("run-1");
    expect(snap!.lastSeq).toBe(5);
    expect(snap!.progress.statusHint).toBe("test");
    expect(typeof snap!.timestamp).toBe("number");
  });

  it("clear remove snapshot", () => {
    saveAgentSnapshot({
      projectId: "p1",
      conversationId: "c1",
      activeRunId: null,
      lastSeq: 0,
      progress,
    });
    clearAgentSnapshot();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(loadAgentSnapshot()).toBeNull();
  });

  it("load retorna null para JSON inválido", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, "not-json");
    expect(loadAgentSnapshot()).toBeNull();
  });

  it("exporta SNAPSHOT_MAX_AGE_MS = 30min", () => {
    expect(SNAPSHOT_MAX_AGE_MS).toBe(30 * 60 * 1000);
  });
});