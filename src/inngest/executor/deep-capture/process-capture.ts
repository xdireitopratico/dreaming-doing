import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrowserAgentContext, CaptureQualification } from "../browser-agent-state";
import { appendJobEvent } from "../../functions/_shared-design-dna";
import {
  deleteUploadedCapture,
  insertQualifiedCapture,
  uploadCapturePng,
  type PersistCaptureInput,
  type PersistCaptureResult,
} from "./capture-storage";
import type { QualifyCaptureFn } from "./capture-qualify";
import type { QualifiedCaptureRecord } from "./navigation-report";

export type ProcessCaptureHooks = {
  onQualified?: (input: QualifiedCaptureRecord) => void | Promise<void>;
  onRejected?: () => void | Promise<void>;
};

export type ProcessCaptureResult = {
  persisted: PersistCaptureResult;
  qualification: CaptureQualification;
};

export async function processQualifiedCapture(
  supabase: SupabaseClient,
  ctx: BrowserAgentContext,
  qualifyFn: QualifyCaptureFn,
  input: PersistCaptureInput,
  hooks?: ProcessCaptureHooks,
): Promise<ProcessCaptureResult | null> {
  const uploaded = await uploadCapturePng(supabase, input);

  const qualification = await qualifyFn({
    pageUrl: input.pageUrl,
    pngBase64: input.pngBase64,
    segmentIndex: input.segmentIndex,
    scrollY: input.scrollY,
    categories: ctx.extractionScope.categories,
  });

  if (!qualification.worthKeeping) {
    await deleteUploadedCapture(supabase, uploaded.storagePath, uploaded.thumbPath);
    await appendJobEvent(supabase, ctx.jobId, "capture_rejected", {
      pageUrl: input.pageUrl,
      segmentIndex: input.segmentIndex ?? 0,
      scrollY: input.scrollY ?? 0,
      reason: qualification.notes ?? "not worth keeping",
      label: qualification.label,
    });
    await hooks?.onRejected?.();
    return null;
  }

  const persisted = await insertQualifiedCapture(supabase, input, uploaded, qualification);

  await appendJobEvent(supabase, ctx.jobId, "capture_qualified", {
    captureId: persisted.captureId,
    label: qualification.label,
    sectionType: qualification.sectionType,
    confidence: qualification.confidence,
    storagePath: persisted.storagePath,
    pageUrl: input.pageUrl,
    byteSize: persisted.byteSize,
    segmentIndex: input.segmentIndex ?? 0,
    scrollY: input.scrollY ?? 0,
  });

  await hooks?.onQualified?.({
    pageUrl: input.pageUrl,
    captureId: persisted.captureId,
    label: qualification.label,
    sectionType: qualification.sectionType,
  });

  return { persisted, qualification };
}