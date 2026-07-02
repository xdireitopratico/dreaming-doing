/** Classificação de retrial por princípio (camadas A/B/C) — loop LLM. */

import { shouldFailFastLlmError, isTimeoutError } from "../llm-errors.ts";

export type RetrialLayer = "in_loop" | "await_user" | "terminal";

export function classifyLlmLoopRetrial(input: {
  err: unknown;
  loopAttempts: number;
  maxLoopAttempts: number;
  timedOut: boolean;
  timeoutRetriedThisStep: boolean;
}): RetrialLayer {
  if (shouldFailFastLlmError(input.err)) return "terminal";
  if (input.timedOut && !input.timeoutRetriedThisStep) return "in_loop";
  if (input.loopAttempts < input.maxLoopAttempts) return "in_loop";
  return "await_user";
}

export function isTimeoutRetriable(err: unknown): boolean {
  return isTimeoutError(err);
}