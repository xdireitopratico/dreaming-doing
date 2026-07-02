import { describe, it, expect } from "vitest";
import {
  createAgentContext,
  addStep,
  isCycleDetected,
  formatStepsForPrompt,
  type BrowserAgentStep,
} from "./browser-agent-state";

const baseCtx = {
  jobId: "job-1",
  url: "https://example.com",
  categories: ["hero", "motion"],
  depth: "deep" as const,
  userId: "user-1",
  sandboxId: "sb-1",
  sandboxAccessToken: "token",
  maxSteps: 10,
};

describe("createAgentContext", () => {
  it("starts empty", () => {
    const ctx = createAgentContext(baseCtx);
    expect(ctx.steps).toEqual([]);
    expect(ctx.dnaPartial).toEqual({});
    expect(ctx.instructions).toEqual([]);
  });
});

describe("addStep", () => {
  it("appends a step and increments", () => {
    let ctx = createAgentContext(baseCtx);
    ctx = addStep(ctx, {
      stepNumber: 1,
      thought: "t1",
      action: { type: "navigate", params: { url: "https://example.com" } },
      observation: { type: "navigate", result: { success: true } },
      timestamp: new Date().toISOString(),
    });
    expect(ctx.steps).toHaveLength(1);
    expect(ctx.steps[0].thought).toBe("t1");
  });
});

describe("isCycleDetected", () => {
  it("detects same URL + same action 3 times", () => {
    const action = { type: "screenshot", params: {} };
    const steps = [
      { thought: "", action, observation: { url: "u1" }, timestamp: "" },
      { thought: "", action, observation: { url: "u1" }, timestamp: "" },
      { thought: "", action, observation: { url: "u1" }, timestamp: "" },
    ];
    expect(isCycleDetected(steps)).toBe(true);
  });
});

describe("formatStepsForPrompt", () => {
  it("omits large base64 from observations (G-CAP-1)", () => {
    const huge = "iVBORw0KGgo" + "a".repeat(5000);
    const steps: BrowserAgentStep[] = [
      {
        stepNumber: 1,
        thought: "capture hero",
        action: { type: "screenshot", params: { fullPage: true } },
        observation: {
          type: "screenshot",
          url: "https://example.com",
          screenshot: huge,
          result: { base64: huge },
        },
        timestamp: new Date().toISOString(),
      },
    ];
    const prompt = formatStepsForPrompt(steps);
    expect(prompt).toContain("omitted");
    expect(prompt).not.toContain(huge);
  });

  it("limits to last N steps", () => {
    const action = { type: "get_url", params: {} };
    const steps: BrowserAgentStep[] = Array.from({ length: 12 }, (_, i) => ({
      stepNumber: i + 1,
      thought: `t${i + 1}`,
      action,
      observation: { type: "get_url", url: "https://example.com" },
      timestamp: new Date().toISOString(),
    }));
    const prompt = formatStepsForPrompt(steps, 5);
    const lines = prompt.split("\n");
    expect(lines.filter((l) => l.startsWith("Step"))).toHaveLength(5);
    expect(prompt).toContain("Step 12");
    expect(prompt).toContain("Step 8");
    expect(prompt).not.toContain("Step 7");
  });
});
