import { describe, it, expect, vi } from "vitest";
import {
  captureObservationFromPersist,
  persistScreenshotCapture,
  CAPTURE_BUCKET,
} from "./capture-storage";

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function mockSupabase() {
  const uploads: Array<{ path: string; bucket: string }> = [];
  const rows: Record<string, unknown>[] = [];

  const storageFrom = vi.fn(() => ({
    upload: vi.fn(async (path: string) => {
      uploads.push({ path, bucket: CAPTURE_BUCKET });
      return { error: null };
    }),
    remove: vi.fn(async () => ({ error: null })),
  }));

  const from = vi.fn((table: string) => {
    if (table !== "design_dna_captures") throw new Error(`unexpected table ${table}`);
    return {
      insert: vi.fn(async (row: Record<string, unknown>) => {
        rows.push(row);
        return { error: null };
      }),
    };
  });

  return {
    client: { storage: { from: storageFrom }, from } as never,
    uploads,
    rows,
  };
}

describe("persistScreenshotCapture", () => {
  it("uploads png + thumb and inserts capture row", async () => {
    const { client, uploads, rows } = mockSupabase();
    const result = await persistScreenshotCapture(client, {
      jobId: "job-1",
      pageUrl: "https://example.com",
      pngBase64: tinyPngBase64,
    });

    expect(result.captureId).toBeTruthy();
    expect(uploads).toHaveLength(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].job_id).toBe("job-1");
    expect(rows[0].storage_path).toContain("job-1/captures/");
  });
});

describe("captureObservationFromPersist", () => {
  it("returns metadata-only observation without screenshot", () => {
    const obs = captureObservationFromPersist(
      "https://example.com",
      {
        captureId: "cap-1",
        storagePath: "jobs/j/captures/cap-1.png",
        thumbPath: "jobs/j/thumbs/cap-1.png",
        byteSize: 100,
      },
      false,
    );
    expect(obs.type).toBe("capture");
    expect(obs.captureId).toBe("cap-1");
    expect(obs.screenshot).toBeUndefined();
  });
});