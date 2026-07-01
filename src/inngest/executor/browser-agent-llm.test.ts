import { describe, it, expect, vi } from "vitest";
import { runAgentPlanningStep, buildAgentPrompt } from "./browser-agent-llm";
import type { BrowserAgentContext } from "./browser-agent-state";

const baseCtx = {
  jobId: "job-1",
  url: "https://example.com",
  categories: ["hero", "motion"],
  depth: "deep" as const,
  userId: "user-1",
  sandboxId: "sb-1",
  sandboxAccessToken: "token",
  maxSteps: 10,
  steps: [],
  dnaPartial: {},
  instructions: [],
} satisfies BrowserAgentContext;

describe("buildAgentPrompt", () => {
  it("includes objective, categories, and tools", () => {
    const prompt = buildAgentPrompt(baseCtx);
    expect(prompt).toContain("https://example.com");
    expect(prompt).toContain("hero");
    expect(prompt).toContain("motion");
    expect(prompt).toContain("navigate");
    expect(prompt).toContain("analyze");
    expect(prompt).toContain("Responda APENAS com o JSON");
  });

  it("includes pending user instructions", () => {
    const ctx = {
      ...baseCtx,
      instructions: [
        { role: "user" as const, content: "focus on hero", status: "pending" as const, createdAt: new Date().toISOString() },
      ],
    };
    const prompt = buildAgentPrompt(ctx);
    expect(prompt).toContain("focus on hero");
  });
});

describe("runAgentPlanningStep", () => {
  it("returns parsed action from LLM", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        thought: "Vou tirar um screenshot do hero.",
        action: { type: "screenshot", params: { fullPage: false } },
        done: false,
      }),
    });

    const result = await runAgentPlanningStep(baseCtx, mockLlm as any);
    expect(result.thought).toContain("screenshot");
    expect(result.action.type).toBe("screenshot");
    expect(result.done).toBe(false);
  });

  it("normalizes unknown action to done", async () => {
    const mockLlm = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        thought: "done",
        action: { type: "unknown_magic", params: {} },
        done: false,
      }),
    });

    const result = await runAgentPlanningStep(baseCtx, mockLlm as any);
    expect(result.action.type).toBe("done");
    expect(result.done).toBe(true);
  });

  it("returns done fallback on parse failure", async () => {
    const mockLlm = vi.fn().mockResolvedValue({ content: "not json" });
    const result = await runAgentPlanningStep(baseCtx, mockLlm as any);
    expect(result.done).toBe(true);
    expect(result.action.type).toBe("done");
  });
});
