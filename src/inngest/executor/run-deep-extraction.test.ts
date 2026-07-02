import { describe, it, expect } from "vitest";
import type { NavigationReport } from "@/lib/agent-deep-capture-contract";
import { snapshotExtractionScope } from "@/lib/agent-deep-capture-contract";
import {
  buildDeepEvidenceText,
  pickCaptureIdsForCategory,
  type JobCaptureRow,
} from "./run-deep-extraction";

const scope = snapshotExtractionScope(["hero", "typography", "motion"]);

function sampleReport(): NavigationReport {
  return {
    jobId: "job-1",
    version: 1,
    scope,
    pagesVisited: [
      {
        url: "https://example.com",
        title: "Example",
        foldsCaptured: 2,
        sections: [
          { type: "hero", label: "Hero headline", captureId: "cap-hero" },
          { type: "features", label: "Feature grid", captureId: "cap-feat" },
        ],
      },
    ],
    capturesQualified: 2,
    capturesRejected: 0,
    highlights: ["Hero headline", "Feature grid"],
    motionObservations: [],
    typographyNotes: [],
    colorNotes: [],
    componentInventory: [],
    gaps: [],
    userInstructionsApplied: [],
    updatedAt: new Date().toISOString(),
  };
}

const captures: JobCaptureRow[] = [
  { id: "cap-hero", thumb_path: "jobs/job-1/thumbs/cap-hero.png", section_type: "hero", label: "Hero", segment_index: 0 },
  { id: "cap-feat", thumb_path: "jobs/job-1/thumbs/cap-feat.png", section_type: "features", label: "Features", segment_index: 1 },
];

describe("run-deep-extraction helpers", () => {
  it("pickCaptureIdsForCategory selects hero captures for hero pass", () => {
    const ids = pickCaptureIdsForCategory(captures, sampleReport(), "hero", 2);
    expect(ids).toEqual(["cap-hero"]);
  });

  it("pickCaptureIdsForCategory falls back to first captures when no match", () => {
    const ids = pickCaptureIdsForCategory(captures, sampleReport(), "interactions", 1);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe("cap-hero");
  });

  it("buildDeepEvidenceText includes highlights and no base64", () => {
    const text = buildDeepEvidenceText(sampleReport(), []);
    expect(text).toContain("Hero headline");
    expect(text).not.toMatch(/iVBOR/);
    expect(text).not.toContain("base64");
  });
});