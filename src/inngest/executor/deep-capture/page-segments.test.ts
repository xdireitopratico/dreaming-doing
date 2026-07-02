import { describe, it, expect } from "vitest";
import { computePageSegmentCount } from "./page-segments";

describe("computePageSegmentCount", () => {
  it("returns >=4 segments for 4000px page with 800px viewport (G-CAP-4)", () => {
    expect(computePageSegmentCount(4000, 800)).toBeGreaterThanOrEqual(4);
    expect(computePageSegmentCount(4000, 800)).toBe(5);
  });

  it("returns 1 for short pages", () => {
    expect(computePageSegmentCount(600, 800)).toBe(1);
  });

  it("respects safety maxSegments ceiling", () => {
    expect(computePageSegmentCount(100_000, 800, 12)).toBe(12);
  });
});