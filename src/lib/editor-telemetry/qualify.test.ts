import { describe, expect, it } from "vitest";
import { buildShotHeadline, qualifySnapshot } from "./qualify";
import type { EditorTelemetrySnapshot } from "./types";

function base(): EditorTelemetrySnapshot {
  return {
    projectId: "p1",
    projectName: "Demo",
    auth: { signedIn: true, userId: "u1", email: "a@b.com" },
    env: {
      supabaseConfigured: true,
      supabaseUrl: "https://x.supabase.co",
      projectRefOk: true,
      missingEnv: [],
    },
    connectors: {
      e2bConnected: true,
      hasUserLlmKey: true,
      tasteChatRemaining: 50,
      tasteStartRemaining: 1,
      connectedKinds: ["e2b", "openai"],
    },
    agent: {
      preferencesConfigured: true,
      mode: "auto",
      running: false,
      agentConnected: false,
      phase: null,
      lastError: null,
      finished: true,
      resumable: false,
      sessionKindResolved: "byok",
      toolCount: 0,
    },
    preview: {
      devUrl: "https://5173-sbx.e2b.app",
      booting: false,
      lastBootError: null,
      warming: false,
      isReactProject: true,
      agentHasRun: true,
      activeView: "preview",
    },
    sandbox: { previewSandboxId: "sbx-1", previewReady: true, previewExpiresAt: null },
    project: { fileCount: 12, messageCount: 4, hasPackageJson: true },
    realtime: { conversationId: "c1" },
  };
}

describe("qualifySnapshot", () => {
  it("scores healthy when no issues", () => {
    const r = qualifySnapshot(base());
    expect(r.health).toBe("healthy");
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.signals.some((s) => s.id === "all-clear")).toBe(true);
  });

  it("flags missing E2B as critical", () => {
    const snap = base();
    snap.connectors.e2bConnected = false;
    const r = qualifySnapshot(snap);
    expect(r.health).toBe("critical");
    expect(r.signals.some((s) => s.id === "e2b-missing")).toBe(true);
  });

  it("flags inngest queue errors", () => {
    const snap = base();
    snap.agent.lastError = "continue_queue reason: inngest_failed";
    const r = qualifySnapshot(snap);
    expect(r.signals.some((s) => s.id === "inngest-queue")).toBe(true);
    expect(r.health).toBe("critical");
  });
});

describe("buildShotHeadline", () => {
  it("mentions first blocker when critical", () => {
    const snap = base();
    snap.connectors.e2bConnected = false;
    const { signals, health, score } = qualifySnapshot(snap);
    const h = buildShotHeadline(health, score, signals, snap);
    expect(h).toContain("E2B");
  });
});