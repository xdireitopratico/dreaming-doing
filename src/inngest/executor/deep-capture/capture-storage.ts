import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentObservation, CaptureQualification } from "../browser-agent-state";

export const CAPTURE_BUCKET = "design-dna-captures";
const THUMB_SIGNED_URL_TTL_SEC = 3600;

export type JobCaptureRow = {
  id: string;
  thumb_path: string;
  section_type: string;
  label: string;
  segment_index: number;
};

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

export type UploadedCapture = PersistCaptureResult & { captureId: string };

export async function uploadCapturePng(
  supabase: SupabaseClient,
  input: PersistCaptureInput,
): Promise<UploadedCapture> {
  const captureId = crypto.randomUUID();
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

  return { captureId, storagePath, thumbPath, byteSize };
}

export async function deleteUploadedCapture(
  supabase: SupabaseClient,
  storagePath: string,
  thumbPath: string,
): Promise<void> {
  await supabase.storage.from(CAPTURE_BUCKET).remove([storagePath, thumbPath]);
}

export async function insertQualifiedCapture(
  supabase: SupabaseClient,
  input: PersistCaptureInput,
  uploaded: UploadedCapture,
  qualification: CaptureQualification & { notes?: string },
): Promise<PersistCaptureResult> {
  const { error: insertErr } = await supabase.from("design_dna_captures").insert({
    id: uploaded.captureId,
    job_id: input.jobId,
    page_url: input.pageUrl,
    page_index: input.pageIndex ?? 0,
    segment_index: input.segmentIndex ?? 0,
    scroll_y: input.scrollY ?? 0,
    viewport_label: input.viewportLabel ?? "desktop",
    section_type: qualification.sectionType,
    label: qualification.label,
    confidence: qualification.confidence,
    storage_path: uploaded.storagePath,
    thumb_path: uploaded.thumbPath,
    byte_size: uploaded.byteSize,
    meta: {
      fullPage: input.fullPage === true,
      notes: qualification.notes ?? null,
    },
  });
  if (insertErr) {
    await deleteUploadedCapture(supabase, uploaded.storagePath, uploaded.thumbPath);
    throw new Error(`capture row insert failed: ${insertErr.message}`);
  }

  return {
    captureId: uploaded.captureId,
    storagePath: uploaded.storagePath,
    thumbPath: uploaded.thumbPath,
    byteSize: uploaded.byteSize,
  };
}

/** @deprecated use upload + qualify + insertQualifiedCapture */
export async function persistScreenshotCapture(
  supabase: SupabaseClient,
  input: PersistCaptureInput,
): Promise<PersistCaptureResult> {
  const uploaded = await uploadCapturePng(supabase, input);
  return insertQualifiedCapture(supabase, input, uploaded, {
    sectionType: "unknown",
    label: input.fullPage ? "full-page segment capture" : "viewport capture",
    confidence: 0,
  });
}

export async function listJobCaptures(
  supabase: SupabaseClient,
  jobId: string,
): Promise<JobCaptureRow[]> {
  const { data, error } = await supabase
    .from("design_dna_captures")
    .select("id, thumb_path, section_type, label, segment_index")
    .eq("job_id", jobId)
    .order("segment_index", { ascending: true });
  if (error) {
    throw new Error(`list captures failed: ${error.message}`);
  }
  return (data ?? []) as JobCaptureRow[];
}

export async function createCaptureThumbSignedUrl(
  supabase: SupabaseClient,
  thumbPath: string,
  expiresInSec = THUMB_SIGNED_URL_TTL_SEC,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .createSignedUrl(thumbPath, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(`thumb signed url failed: ${error?.message ?? "no url"}`);
  }
  return data.signedUrl;
}

/** Observation shape for agent history — no pixels (law L2). */
export function captureObservationFromPersist(
  pageUrl: string,
  persisted: PersistCaptureResult,
  qualification: CaptureQualification,
): AgentObservation {
  return {
    type: "capture",
    url: pageUrl,
    captureId: persisted.captureId,
    storagePath: persisted.storagePath,
    thumbPath: persisted.thumbPath,
    byteSize: persisted.byteSize,
    qualification,
    timestamp: new Date().toISOString(),
  };
}