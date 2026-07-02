import type { AgentObservation } from "../browser-agent-state";

const OMIT_THRESHOLD_CHARS = 80;

/**
 * Remove pixels do texto enviado ao LLM (lei L1 — PIXELS ≠ PROMPT).
 * SSOT: DESIGN_DNA_DEEP_CAPTURE_SPEC.md §3 L1, PR-1.
 */
export function sanitizeObservationForEvidence(obs: AgentObservation): Record<string, unknown> {
  const copy = { ...obs } as Record<string, unknown>;
  if (typeof copy.screenshot === "string" && copy.screenshot.length > OMIT_THRESHOLD_CHARS) {
    copy.screenshot = `[screenshot omitted, ${copy.screenshot.length} chars]`;
  }
  if (copy.result && typeof copy.result === "object" && copy.result !== null) {
    const result = { ...(copy.result as Record<string, unknown>) };
    if (typeof result.base64 === "string" && result.base64.length > OMIT_THRESHOLD_CHARS) {
      result.base64 = `[base64 omitted, ${result.base64.length} chars]`;
    }
    copy.result = result;
  }
  return copy;
}

/** Grep-friendly guard: planner/synthesis prompts must not embed raw PNG base64. */
export function promptContainsRawPngBase64(text: string): boolean {
  return text.includes("iVBORw0KGgo");
}