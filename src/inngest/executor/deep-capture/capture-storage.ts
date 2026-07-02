import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentObservation } from "../browser-agent-state";

export const CAPTURE_BUCKET = "design-dna-captures";

export type PersistCaptureInput = {
  jobId: string;
  pageUrl: string;
  pageIndex?: number;
  segmentIndex?: number;
  scrollY?: number;
  viewportLabel?: string;
  pngBase64: string;
  fullPage?: boolean;
};

export type PersistCaptureResult = {
  captureId: string;
  storagePath: string;
  thumbPath: string;
  byteSize: number;
};

function decodeBase64Png(base64: string): Buffer {
  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(raw, "base64");
}

export async function persistScreenshotCapture(
  supabase: SupabaseClient,
  input: PersistCaptureInput,
): Promise<PersistCaptureResult> {
  const captureId = crypto.randomUUID();
  const pageIndex = input.pageIndex ?? 0;
  const segmentIndex = input.segmentIndex ?? 0;
  const buffer = decodeBase64Png(input.pngBase64);
  const byteSize = buffer.byteLength;

  const storagePath = `jobs/${input.jobId}/captures/${captureId}.png`;
  const thumbPath = `jobs/${input.jobId}/thumbs/${captureId}.png`;

  const { error: uploadErr } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .upload(storagePath, buffer, { contentType: "image/png", upsert: false });
  if (uploadErr) {
    throw new Error(`capture upload failed: ${uploadErr.message}`);
  }

  const { error: thumbErr } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .upload(thumbPath, buffer, { contentType: "image/png", upsert: false });
  if (thumbErr) {
    await supabase.storage.from(CAPTURE_BUCKET).remove([storagePath]);
    throw new Error(`thumb upload failed: ${thumbErr.message}`);
  }

  const label = input.fullPage ? "full-page segment capture" : "viewport capture";

  const { error: insertErr } = await supabase.from("design_dna_captures").insert({
    id: captureId,
    job_id: input.jobId,
    page_url: input.pageUrl,
    page_index: pageIndex,
    segment_index: segmentIndex,
    scroll_y: input.scrollY ?? 0,
    viewport_label: input.viewportLabel ?? "desktop",
    section_type: "unknown",
    label,
    confidence: 0,
    storage_path: storagePath,
    thumb_path: thumbPath,
    byte_size: byteSize,
    meta: { fullPage: input.fullPage === true },
  });
  if (insertErr) {
    await supabase.storage.from(CAPTURE_BUCKET).remove([storagePath, thumbPath]);
    throw new Error(`capture row insert failed: ${insertErr.message}`);
  }

  return { captureId, storagePath, thumbPath, byteSize };
}

/** Observation shape for agent history — no pixels (law L2). */
export function captureObservationFromPersist(
  pageUrl: string,
  persisted: PersistCaptureResult,
  fullPage?: boolean,
): AgentObservation {
  return {
    type: "capture",
    url: pageUrl,
    captureId: persisted.captureId,
    storagePath: persisted.storagePath,
    thumbPath: persisted.thumbPath,
    byteSize: persisted.byteSize,
    qualification: {
      sectionType: "unknown",
      label: fullPage ? "full-page segment capture" : "viewport capture",
      confidence: 0,
    },
    timestamp: new Date().toISOString(),
  };
}