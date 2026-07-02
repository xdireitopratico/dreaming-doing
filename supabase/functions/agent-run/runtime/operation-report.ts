// runtime/operation-report.ts — Report HOTL como texto no chat (sem card)
import type { RunOperationMeta } from "../../_shared/agent-contract-operation.ts";
import {
  type OperationReportKind,
  withHotlReport,
} from "../../_shared/agent-contract-operation.ts";

export type OperationReportCtx = {
  kind: OperationReportKind;
  summary: string;
  steps?: number;
  touchedPaths?: string[];
};

export function appendHotlReport(
  closing: string,
  meta: RunOperationMeta,
  ctx: OperationReportCtx,
): string {
  return withHotlReport(closing, meta, ctx);
}