import { describe, it, expect, vi } from "vitest";
import {
  captureObservationFromPersist,
  insertQualifiedCapture,
  uploadCapturePng,
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

describe("uploadCapturePng + insertQualifiedCapture", () => {
  it("uploads png + thumb and inserts qualified capture row", async () => {
    const { client, uploads, rows } = mockSupabase();
    const uploaded = await uploadCapturePng(client, {
      jobId: "job-1",
      pageUrl: "https://example.com",
      pngBase64: tinyPngBase64,
    });

    const result = await insertQualifiedCapture(
      client,
      {
        jobId: "job-1",
        pageUrl: "https://example.com",
        pngBase64: tinyPngBase64,
      },
      uploaded,
      { label: "Hero section", sectionType: "hero", confidence: 0.9 },
    );

    expect(result.captureId).toBeTruthy();
    expect(uploads).toHaveLength(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].job_id).toBe("job-1");
    expect(rows[0].label).toBe("Hero section");
    expect(rows[0].section_type).toBe("hero");
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
      { label: "Hero", sectionType: "hero", confidence: 0.8 },
    );
    expect(obs.type).toBe("capture");
    expect(obs.captureId).toBe("cap-1");
    expect(obs.screenshot).toBeUndefined();
  });
});