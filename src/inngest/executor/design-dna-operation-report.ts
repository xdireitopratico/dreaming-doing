import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatOperationReportText,
  type OperationReportKind,
  type RunOperationMeta,
} from "@/lib/agent-operation-contract";

/** Report HOTL no chat do job (design_dna_instructions) — texto plano, sem card. */
export async function postDesignDnaOperationReport(
  supabase: SupabaseClient,
  jobId: string,
  meta: RunOperationMeta,
  input: {
    kind: OperationReportKind;
    summary: string;
    steps?: number;
    touchedPaths?: string[];
  },
): Promise<void> {
  if (!meta.reportOnExit) return;
  const text = formatOperationReportText({
    ...input,
    startedAt: meta.startedAt,
    wallMs: meta.wallMs,
  });
  const { error } = await supabase.from("design_dna_instructions").insert({
    job_id: jobId,
    role: "assistant",
    content: text,
    status: "pending",
  });
  if (error) {
    console.warn("[design-dna] failed to post HOTL report:", error.message);
  }
}