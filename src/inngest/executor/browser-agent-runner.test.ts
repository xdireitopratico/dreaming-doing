import { beforeEach, describe, it, expect, vi } from "vitest";
import { snapshotExtractionScope } from "@/lib/agent-deep-capture-contract";
import { runBrowserAgent } from "./browser-agent-runner";
import { createAgentContext } from "./browser-agent-state";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockAppendEvent = vi.fn().mockResolvedValue(undefined);
const mockProcessQualifiedCapture = vi.fn().mockResolvedValue({
  persisted: {
    captureId: "cap-test",
    storagePath: "jobs/job-1/captures/cap-test.png",
    thumbPath: "jobs/job-1/thumbs/cap-test.png",
    byteSize: 100,
  },
  qualification: {
    worthKeeping: true,
    label: "Hero viewport",
    sectionType: "hero",
    confidence: 0.85,
  },
});

vi.mock("../functions/_shared-design-dna", () => ({
  appendJobEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("./deep-capture/process-capture", () => ({
  processQualifiedCapture: (...args: unknown[]) => mockProcessQualifiedCapture(...args),
}));
describe("runBrowserAgent", () => {
  beforeEach(() => {
    mockAppendEvent.mockClear();
    mockProcessQualifiedCapture.mockClear();
  });

  it("completes after agent returns done", async () => {
    const tools = {
      getUrl: vi.fn().mockResolvedValue({ url: "https://example.com" }),
      takeScreenshot: vi.fn().mockResolvedValue({ base64: "abc" }),
      capturePageSegments: vi.fn(),
    };

    let step = 0;
    const planner = vi.fn().mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return Promise.resolve({
          thought: "screenshot",
          action: { type: "screenshot", params: {} },
          done: false,
        });
      }
      return Promise.resolve({
        thought: "done",
        action: { type: "done", params: {} },
        done: true,
      });
    });

    const synthesizer = vi.fn().mockResolvedValue({
      name: "Example",
      source_url: "https://example.com",
      category: "full_page",
      layout: null,
      color: null,
      typography: null,
      motion: null,
      interaction: null,
      component: null,
      implementation_notes: null,
      quality_score: 8,
      quality_source: "deep_agent",
      serves_domains: [],
      compatible_languages: [],
      compatible_moods: [],
      extracted_at: new Date().toISOString(),
    });

    const ctx = createAgentContext({
      jobId: "job-1",
      url: "https://example.com",
      categories: ["hero"],
      depth: "deep",
      userId: "user-1",
      sandboxId: "sb-1",
      sandboxAccessToken: "token",
      maxSteps: 5,
      extractionScope: snapshotExtractionScope(["hero"]),
    });

    const result = await runBrowserAgent(
      ctx,
      {} as SupabaseClient,
      tools as any,
      planner as any,
      synthesizer as any,
      async () => [],
      async () => {},
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dna.quality_score).toBe(8);
    }
    expect(planner).toHaveBeenCalledTimes(2);
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.anything(), "job-1", "agent_done", expect.any(Object));
  });

  it("returns error if action execution throws", async () => {
    const tools = {
      getUrl: vi.fn().mockResolvedValue({ url: "https://example.com" }),
      takeScreenshot: vi.fn().mockRejectedValue(new Error("screenshot failed")),
      capturePageSegments: vi.fn(),
    };
    const planner = vi.fn().mockResolvedValue({
      thought: "screenshot",
      action: { type: "screenshot", params: {} },
      done: false,
    });
    const synthesizer = vi.fn();

    const ctx = createAgentContext({
      jobId: "job-2",
      url: "https://example.com",
      categories: ["hero"],
      depth: "deep",
      userId: "user-1",
      sandboxId: "sb-1",
      sandboxAccessToken: "token",
      maxSteps: 5,
      extractionScope: snapshotExtractionScope(["hero"]),
    });

    const result = await runBrowserAgent(ctx, {} as SupabaseClient, tools as any, planner, synthesizer, async () => [], async () => {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("screenshot failed");
    }
  });

  it("fullPage screenshot uses capturePageSegments and qualifies each fold", async () => {
    const tools = {
      getUrl: vi.fn().mockResolvedValue({ url: "https://example.com" }),
      takeScreenshot: vi.fn().mockResolvedValue({ base64: "" }),
      capturePageSegments: vi.fn().mockResolvedValue({
        segments: [
          { segmentIndex: 0, scrollY: 0, base64: "seg0" },
          { segmentIndex: 1, scrollY: 800, base64: "seg1" },
        ],
        scrollHeight: 1600,
        viewportHeight: 800,
        segmentCount: 2,
      }),
    };

    const planner = vi.fn().mockResolvedValue({
      thought: "full page segments",
      action: { type: "screenshot", params: { fullPage: true } },
      done: true,
    });

    const synthesizer = vi.fn().mockResolvedValue({
      name: "Example",
      source_url: "https://example.com",
      category: "full_page",
      layout: null,
      color: null,
      typography: null,
      motion: null,
      interaction: null,
      component: null,
      implementation_notes: null,
      quality_score: 8,
      quality_source: "deep_agent",
      serves_domains: [],
      compatible_languages: [],
      compatible_moods: [],
      extracted_at: new Date().toISOString(),
    });

    const ctx = createAgentContext({
      jobId: "job-seg",
      url: "https://example.com",
      categories: ["hero"],
      depth: "deep",
      userId: "user-1",
      sandboxId: "sb-1",
      sandboxAccessToken: "token",
      maxSteps: 5,
      extractionScope: snapshotExtractionScope(["hero"]),
    });

    const result = await runBrowserAgent(
      ctx,
      {} as SupabaseClient,
      tools as any,
      planner as any,
      synthesizer as any,
      async () => [],
      async () => {},
    );

    expect(result.ok).toBe(true);
    expect(tools.capturePageSegments).toHaveBeenCalledTimes(1);
    expect(tools.takeScreenshot).toHaveBeenCalledTimes(1);
    expect(mockProcessQualifiedCapture).toHaveBeenCalledTimes(2);
    expect(mockProcessQualifiedCapture).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ jobId: "job-seg" }),
      expect.any(Function),
      expect.objectContaining({
        jobId: "job-seg",
        pageUrl: "https://example.com",
        pngBase64: "seg0",
        segmentIndex: 0,
        scrollY: 0,
        fullPage: true,
      }),
    );
    expect(mockProcessQualifiedCapture).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ jobId: "job-seg" }),
      expect.any(Function),
      expect.objectContaining({
        pngBase64: "seg1",
        segmentIndex: 1,
        scrollY: 800,
        fullPage: true,
      }),
    );
  });

  it("consumes pending instructions before planning", async () => {
    const tools = {
      getUrl: vi.fn().mockResolvedValue({ url: "https://example.com" }),
      takeScreenshot: vi.fn().mockResolvedValue({ base64: "" }),
      capturePageSegments: vi.fn(),
    };

    let seenInstructions: unknown[] = [];
    const planner = vi.fn().mockImplementation((ctx: any) => {
      seenInstructions = ctx.instructions;
      return Promise.resolve({ thought: "done", action: { type: "done", params: {} }, done: true });
    });
    const synthesizer = vi.fn().mockResolvedValue({
      name: "Example",
      source_url: "https://example.com",
      category: "full_page",
      layout: null,
      color: null,
      typography: null,
      motion: null,
      interaction: null,
      component: null,
      implementation_notes: null,
      quality_score: 7,
      quality_source: "deep_agent",
      serves_domains: [],
      compatible_languages: [],
      compatible_moods: [],
      extracted_at: new Date().toISOString(),
    });

    const ctx = createAgentContext({
      jobId: "job-3",
      url: "https://example.com",
      categories: ["hero"],
      depth: "deep",
      userId: "user-1",
      sandboxId: "sb-1",
      sandboxAccessToken: "token",
      maxSteps: 5,
      extractionScope: snapshotExtractionScope(["hero"]),
    });

    const fetchInstructions = vi.fn().mockResolvedValue([
      { id: "i1", role: "user", content: "focus", status: "pending", createdAt: new Date().toISOString() },
    ]);
    const markConsumed = vi.fn().mockResolvedValue(undefined);

    await runBrowserAgent(ctx, {} as SupabaseClient, tools as any, planner, synthesizer, fetchInstructions, markConsumed);

    expect(fetchInstructions).toHaveBeenCalledWith("job-3");
    expect(markConsumed).toHaveBeenCalledWith("job-3");
    expect(seenInstructions).toHaveLength(1);
    expect((seenInstructions[0] as any).content).toBe("focus");
  });
});
