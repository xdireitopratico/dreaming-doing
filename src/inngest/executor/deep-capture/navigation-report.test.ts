import { describe, it, expect } from "vitest";
import { snapshotExtractionScope } from "@/lib/agent-deep-capture-contract";
import {
  createNavigationReport,
  recordQualifiedCapture,
  recordRejectedCapture,
  recordPageVisit,
  shouldEmitPartialReport,
  bumpPartialVersion,
  buildPartialPayload,
  summarizeNavigationReport,
  type NavigationReport,
} from "./navigation-report";

const scope = snapshotExtractionScope(["hero"]);

function baseReport(): NavigationReport {
  return createNavigationReport("job-1", scope);
}

describe("navigation-report", () => {
  it("increments version on bumpPartialVersion", () => {
    let report = baseReport();
    expect(report.version).toBe(0);
    report = bumpPartialVersion(report);
    expect(report.version).toBe(1);
    report = bumpPartialVersion(report);
    expect(report.version).toBe(2);
  });

  it("emits partial every N qualified captures per reportPolicy", () => {
    const cadence = scope.reportPolicy.partialEveryNCaptures;
    let report = baseReport();
    for (let i = 1; i < cadence; i++) {
      report = recordQualifiedCapture(report, {
        pageUrl: "https://example.com",
        captureId: `cap-${i}`,
        label: `Section ${i}`,
        sectionType: "hero",
      });
      expect(shouldEmitPartialReport(report, scope)).toBe(false);
    }
    report = recordQualifiedCapture(report, {
      pageUrl: "https://example.com",
      captureId: `cap-${cadence}`,
      label: `Section ${cadence}`,
      sectionType: "hero",
    });
    expect(shouldEmitPartialReport(report, scope)).toBe(true);
    const payload = buildPartialPayload(report);
    expect(payload.capturesQualified).toBe(cadence);
    expect(payload.highlights.length).toBeGreaterThan(0);
  });

  it("tracks pages visited and sections per page", () => {
    let report = recordPageVisit(baseReport(), "https://a.com", "Page A");
    report = recordQualifiedCapture(report, {
      pageUrl: "https://a.com",
      captureId: "cap-a1",
      label: "Hero A",
      sectionType: "hero",
    });
    report = recordPageVisit(report, "https://b.com", "Page B");
    report = recordQualifiedCapture(report, {
      pageUrl: "https://b.com",
      captureId: "cap-b1",
      label: "Hero B",
      sectionType: "hero",
    });

    expect(report.pagesVisited).toHaveLength(2);
    expect(report.pagesVisited[0].foldsCaptured).toBe(1);
    expect(report.pagesVisited[0].sections[0].captureId).toBe("cap-a1");
    expect(report.capturesQualified).toBe(2);
  });

  it("increments rejected count without affecting qualified cadence", () => {
    let report = baseReport();
    report = recordRejectedCapture(report);
    report = recordRejectedCapture(report);
    report = recordQualifiedCapture(report, {
      pageUrl: "https://example.com",
      captureId: "cap-1",
      label: "Hero",
      sectionType: "hero",
    });
    expect(report.capturesQualified).toBe(1);
    expect(shouldEmitPartialReport(report, scope)).toBe(false);
  });

  it("summarizeNavigationReport produces compact final payload", () => {
    let report = recordQualifiedCapture(baseReport(), {
      pageUrl: "https://example.com",
      captureId: "cap-1",
      label: "Hero headline",
      sectionType: "hero",
    });
    report = bumpPartialVersion(report);
    const summary = summarizeNavigationReport(report);
    expect(summary.jobId).toBe("job-1");
    expect(summary.capturesQualified).toBe(1);
    expect(summary.pagesVisited).toHaveLength(1);
    expect(summary.highlights).toContain("Hero headline");
  });
});