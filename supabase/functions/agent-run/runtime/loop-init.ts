// runtime/loop-init.ts — Resolução de request e defaults do loop (Fase 2.4)
import { extractOriginalUserRequest } from "../run-context.ts";
import type { ChatMessage } from "../types.ts";
import type { AgentLoopOptions } from "./loop-options.ts";

export function resolveLoopOriginalUserRequest(
  messages: ChatMessage[],
  options?: Pick<AgentLoopOptions, "approvedPlanBuild" | "planSummary">,
): string {
  const extracted = extractOriginalUserRequest(messages);
  const planDocument = options?.planSummary?.trim() ?? "";
  if (options?.approvedPlanBuild && planDocument) return planDocument;
  return extracted;
}

export function resolveMaxStepsLimit(options?: AgentLoopOptions): number {
  const base = options?.maxSteps ?? 20;
  const fromCheckpoint = options?.maxStepsFromCheckpoint;
  if (fromCheckpoint && fromCheckpoint > 0) return fromCheckpoint;
  return base;
}

export function resolveSkipConversationalGate(options?: AgentLoopOptions): boolean {
  return options?.skipConversationalGate ?? options?.approvedPlanBuild ?? false;
}