// src/inngest/executor/browser-agent-state.ts

import { sanitizeObservationForEvidence } from "./deep-capture/sanitize";
import type { ExtractionScope } from "@/lib/agent-deep-capture-contract";

export type AgentAction =
  | { type: "navigate"; params: { url: string } }
  | { type: "screenshot"; params: { fullPage?: boolean } }
  | { type: "scroll"; params: { y: number } }
  | { type: "click"; params: { selector: string } }
  | { type: "type"; params: { selector: string; text: string } }
  | { type: "analyze"; params: { selector: string } }
  | { type: "evaluate"; params: { expression: string } }
  | { type: "get_url"; params: Record<string, never> }
  | { type: "done"; params: Record<string, never> };

export type CaptureQualification = {
  sectionType: string;
  label: string;
  selector?: string;
  confidence: number;
};

export type AgentObservation = {
  type: string;
  url?: string;
  result?: unknown;
  /** @deprecated in agent history — use captureId + Storage (G-CAP-2) */
  screenshot?: string;
  captureId?: string;
  storagePath?: string;
  thumbPath?: string;
  byteSize?: number;
  qualification?: CaptureQualification;
  segmentCount?: number;
  scrollHeight?: number;
  viewportHeight?: number;
  segments?: Array<{ segmentIndex: number; scrollY: number; base64?: string }>;
  captures?: Array<{
    captureId: string;
    segmentIndex: number;
    scrollY: number;
    storagePath?: string;
    byteSize?: number;
  }>;
  error?: string;
  timestamp?: string;
};

export type BrowserAgentStep = {
  stepNumber: number;
  thought: string;
  action: AgentAction;
  observation: AgentObservation;
  timestamp: string;
};

export type UserInstruction = {
  id?: string;
  role: "user" | "system";
  content: string;
  status: "pending" | "consumed" | "canceled";
  createdAt: string;
  consumedAt?: string;
};

export type BrowserAgentContext = {
  jobId: string;
  url: string;
  categories: string[];
  depth: "deep";
  userId: string;
  sandboxId: string;
  sandboxAccessToken: string | null;
  maxSteps: number;
  extractionScope: ExtractionScope;
  steps: BrowserAgentStep[];
  dnaPartial: Record<string, unknown>;
  instructions: UserInstruction[];
};

export function createAgentContext(
  init: Omit<BrowserAgentContext, "steps" | "dnaPartial" | "instructions">,
): BrowserAgentContext {
  return {
    ...init,
    steps: [],
    dnaPartial: {},
    instructions: [],
  };
}

export function addStep(
  ctx: BrowserAgentContext,
  step: BrowserAgentStep,
): BrowserAgentContext {
  return {
    ...ctx,
    steps: [...ctx.steps, step],
  };
}

export function isCycleDetected(steps: BrowserAgentStep[], threshold = 3): boolean {
  if (steps.length < threshold) return false;
  const last = steps.slice(-threshold);
  const firstUrl = last[0]?.observation?.url;
  const firstAction = JSON.stringify(last[0]?.action);
  return last.every(
    (s) =>
      s.observation?.url === firstUrl &&
      JSON.stringify(s.action) === firstAction,
  );
}

export function formatStepsForPrompt(steps: BrowserAgentStep[], limit = 10): string {
  return steps
    .slice(-limit)
    .map(
      (s) =>
        `Step ${s.stepNumber}:\nThought: ${s.thought}\nAction: ${s.action.type} ${JSON.stringify(
          s.action.params,
        )}\nObservation: ${JSON.stringify(sanitizeObservationForEvidence(s.observation))}`,
    )
    .join("\n\n");
}
