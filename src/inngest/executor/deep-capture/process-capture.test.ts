import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpload = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockAppend = vi.fn();

vi.mock("./capture-storage", () => ({
  uploadCapturePng: (...args: unknown[]) => mockUpload(...args),
  insertQualifiedCapture: (...args: unknown[]) => mockInsert(...args),
  deleteUploadedCapture: (...args: unknown[]) => mockDelete(...args),
}));

vi.mock("../../functions/_shared-design-dna", () => ({
  appendJobEvent: (...args: unknown[]) => mockAppend(...args),
}));

import { processQualifiedCapture } from "./process-capture";
import { snapshotExtractionScope } from "@/lib/agent-deep-capture-contract";
import { createAgentContext } from "../browser-agent-state";

const ctx = createAgentContext({
  jobId: "job-1",
  url: "https://example.com",
  categories: ["hero"],
  depth: "deep",
  userId: "u1",
  sandboxId: "sb",
  sandboxAccessToken: "t",
  maxSteps: 5,
  extractionScope: snapshotExtractionScope(["hero"]),
});

describe("processQualifiedCapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({
      captureId: "cap-1",
      storagePath: "jobs/job-1/captures/cap-1.png",
      thumbPath: "jobs/job-1/thumbs/cap-1.png",
      byteSize: 50,
    });
    mockInsert.mockResolvedValue({
      captureId: "cap-1",
      storagePath: "jobs/job-1/captures/cap-1.png",
      thumbPath: "jobs/job-1/thumbs/cap-1.png",
      byteSize: 50,
    });
  });

  it("rejects capture when worthKeeping is false", async () => {
    const supabase = {} as never;
    const result = await processQualifiedCapture(supabase, ctx, async () => ({
      worthKeeping: false,
      label: "blank",
      sectionType: "unknown",
      confidence: 0.1,
      notes: "empty frame",
    }), {
      jobId: "job-1",
      pageUrl: "https://example.com",
      pngBase64: "abc",
    });

    expect(result).toBeNull();
    expect(mockDelete).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockAppend).toHaveBeenCalledWith(
      supabase,
      "job-1",
      "capture_rejected",
      expect.objectContaining({ reason: "empty frame" }),
    );
  });

  it("inserts and emits capture_qualified when accepted", async () => {
    const supabase = {} as never;
    const result = await processQualifiedCapture(supabase, ctx, async () => ({
      worthKeeping: true,
      label: "Hero CTA",
      sectionType: "hero",
      confidence: 0.88,
    }), {
      jobId: "job-1",
      pageUrl: "https://example.com",
      pngBase64: "abc",
    });

    expect(result?.qualification.label).toBe("Hero CTA");
    expect(mockInsert).toHaveBeenCalled();
    expect(mockAppend).toHaveBeenCalledWith(
      supabase,
      "job-1",
      "capture_qualified",
      expect.objectContaining({ sectionType: "hero" }),
    );
  });
});