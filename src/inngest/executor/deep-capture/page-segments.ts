/** Adaptive segment count — no product cap (spec L8); optional safety ceiling. */
export function computePageSegmentCount(
  scrollHeight: number,
  viewportHeight: number,
  maxSegments = 50,
): number {
  const vh = Math.max(viewportHeight, 1);
  const sh = Math.max(scrollHeight, vh);
  const needed = Math.max(1, Math.ceil(sh / vh));
  return Math.min(needed, maxSegments);
}

export type PageSegmentPayload = {
  segmentIndex: number;
  scrollY: number;
  base64: string;
};

export type CapturePageSegmentsResult = {
  segments: PageSegmentPayload[];
  scrollHeight: number;
  viewportHeight: number;
  segmentCount: number;
  error?: string;
};