import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrowserAgentContext,
  BrowserAgentStep,
  AgentAction,
  AgentObservation,
  UserInstruction,
} from "./browser-agent-state";
import type { ExtractionScope } from "@/lib/agent-deep-capture-contract";
import { addStep, isCycleDetected } from "./browser-agent-state";
import type { AgentPlan } from "./browser-agent-llm";
import type { SynthesizedDNA } from "./browser-agent-synthesis";
import { appendJobEvent } from "../functions/_shared-design-dna";
import { captureObservationFromPersist } from "./deep-capture/capture-storage";
import { heuristicQualification, type QualifyCaptureFn } from "./deep-capture/capture-qualify";
import { processQualifiedCapture, type ProcessCaptureHooks } from "./deep-capture/process-capture";
import { type NavigationReportTracker } from "./deep-capture/navigation-report";
import { sanitizeObservationForEvidence } from "./deep-capture/sanitize";
import {
  takeScreenshot,
  capturePageSegments,
  navigateTo,
  scrollPage,
  analyzeElement,
  getUrl,
  clickElement,
  typeText,
  evaluateJs,
} from "./browser-cdp-tools";

type SegmentRaw = { segmentIndex: number; scrollY: number; base64: string };

export type CdpTools = {
  takeScreenshot: typeof takeScreenshot;
  capturePageSegments: typeof capturePageSegments;
  navigateTo: typeof navigateTo;
  scrollPage: typeof scrollPage;
  analyzeElement: typeof analyzeElement;
  getUrl: typeof getUrl;
  clickElement: typeof clickElement;
  typeText: typeof typeText;
  evaluateJs: typeof evaluateJs;
};

export type PlannerFn = (
  ctx: BrowserAgentContext,
  screenshotBase64?: string,
) => Promise<AgentPlan>;

export type SynthesizerFn = (
  steps: BrowserAgentStep[],
  url: string,
  categories: string[],
) => Promise<SynthesizedDNA>;

export type FetchInstructionsFn = (jobId: string) => Promise<UserInstruction[]>;
export type MarkInstructionsConsumedFn = (jobId: string) => Promise<void>;

function captureHooks(reportTracker?: NavigationReportTracker): ProcessCaptureHooks | undefined {
  if (!reportTracker) return undefined;
  return {
    onQualified: (input) => reportTracker.recordQualified(input),
    onRejected: () => reportTracker.recordRejected(),
  };
}

async function persistSegmentBatch(
  supabase: SupabaseClient,
  ctx: BrowserAgentContext,
  qualifyFn: QualifyCaptureFn,
  pageUrl: string,
  segments: SegmentRaw[],
  hooks?: ProcessCaptureHooks,
): Promise<AgentObservation> {
  const captures: Array<{
    captureId: string;
    segmentIndex: number;
    scrollY: number;
    storagePath: string;
    byteSize: number;
    label: string;
    sectionType: string;
    confidence: number;
  }> = [];

  for (const seg of segments) {
    const processed = await processQualifiedCapture(
      supabase,
      ctx,
      qualifyFn,
      {
        jobId: ctx.jobId,
        pageUrl,
        pngBase64: seg.base64,
        segmentIndex: seg.segmentIndex,
        scrollY: seg.scrollY,
        fullPage: true,
      },
      hooks,
    );
    if (!processed) continue;
    captures.push({
      captureId: processed.persisted.captureId,
      segmentIndex: seg.segmentIndex,
      scrollY: seg.scrollY,
      storagePath: processed.persisted.storagePath,
      byteSize: processed.persisted.byteSize,
      label: processed.qualification.label,
      sectionType: processed.qualification.sectionType,
      confidence: processed.qualification.confidence,
    });
  }

  return {
    type: "capture_segments",
    url: pageUrl,
    segmentCount: captures.length,
    captures,
    timestamp: new Date().toISOString(),
  };
}

async function finalizeObservation(
  supabase: SupabaseClient,
  ctx: BrowserAgentContext,
  qualifyFn: QualifyCaptureFn,
  action: AgentAction,
  observation: AgentObservation,
  hooks?: ProcessCaptureHooks,
): Promise<AgentObservation> {
  const pageUrl = observation.url ?? ctx.url;

  if (observation.type === "capture_segments") {
    const rawSegments = (observation as AgentObservation & { segments?: SegmentRaw[] }).segments;
    if (Array.isArray(rawSegments) && rawSegments.length > 0) {
      return persistSegmentBatch(supabase, ctx, qualifyFn, pageUrl, rawSegments, hooks);
    }
    return observation;
  }

  if (
    action.type === "screenshot" &&
    typeof observation.screenshot === "string" &&
    observation.screenshot.length > 0
  ) {
    const processed = await processQualifiedCapture(
      supabase,
      ctx,
      qualifyFn,
      {
        jobId: ctx.jobId,
        pageUrl,
        pngBase64: observation.screenshot,
        fullPage: false,
      },
      hooks,
    );
    if (!processed) {
      return {
        type: "capture",
        url: pageUrl,
        error: "capture rejected by qualification",
        timestamp: new Date().toISOString(),
      };
    }
    return captureObservationFromPersist(
      pageUrl,
      processed.persisted,
      processed.qualification,
    );
  }
  return observation;
}

async function executeAction(
  ctx: BrowserAgentContext,
  action: AgentAction,
  tools: CdpTools,
): Promise<AgentObservation> {
  const ts = new Date().toISOString();
  const currentUrl = await tools.getUrl(ctx.sandboxId, ctx.sandboxAccessToken);

  switch (action.type) {
    case "navigate": {
      const res = await tools.navigateTo(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.url,
      );
      return { type: "navigate", url: action.params.url, result: res, timestamp: ts };
    }
    case "screenshot": {
      if (action.params.fullPage === true) {
        const segRes = await tools.capturePageSegments(ctx.sandboxId, ctx.sandboxAccessToken);
        if (segRes.error) {
          return {
            type: "capture_segments",
            url: currentUrl.url,
            error: segRes.error,
            segments: [],
            scrollHeight: segRes.scrollHeight,
            viewportHeight: segRes.viewportHeight,
            segmentCount: 0,
            timestamp: ts,
          };
        }
        return {
          type: "capture_segments",
          url: currentUrl.url,
          segments: segRes.segments,
          scrollHeight: segRes.scrollHeight,
          viewportHeight: segRes.viewportHeight,
          segmentCount: segRes.segmentCount,
          timestamp: ts,
        };
      }
      const res = await tools.takeScreenshot(ctx.sandboxId, ctx.sandboxAccessToken, false);
      return { type: "screenshot", url: currentUrl.url, screenshot: res.base64, result: res, timestamp: ts };
    }
    case "scroll": {
      const res = await tools.scrollPage(ctx.sandboxId, ctx.sandboxAccessToken, action.params.y);
      return { type: "scroll", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "click": {
      const res = await tools.clickElement(ctx.sandboxId, ctx.sandboxAccessToken, action.params.selector);
      return { type: "click", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "type": {
      const res = await tools.typeText(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.selector,
        action.params.text,
      );
      return { type: "type", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "analyze": {
      const res = await tools.analyzeElement(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.selector,
      );
      return { type: "analyze", url: currentUrl.url, result: res, timestamp: ts };
    }
    case "evaluate": {
      const { result, error } = await tools.evaluateJs(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.expression,
      );
      return { type: "evaluate", url: currentUrl.url, result, error, timestamp: ts };
    }
    case "get_url": {
      return { type: "get_url", url: currentUrl.url, result: currentUrl, timestamp: ts };
    }
    case "done":
    default:
      return { type: "done", url: currentUrl.url, result: {}, timestamp: ts };
  }
}

const STEP_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Step timeout (${ms}ms): ${label}`)),
      ms,
    );
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function runBrowserAgent(
  initialCtx: BrowserAgentContext,
  supabase: SupabaseClient,
  tools: CdpTools,
  planner: PlannerFn,
  synthesizer: SynthesizerFn,
  fetchInstructions: FetchInstructionsFn,
  markConsumed: MarkInstructionsConsumedFn,
  resolveScope?: () => ExtractionScope,
  qualifyCapture?: QualifyCaptureFn,
  reportTracker?: NavigationReportTracker,
): Promise<
  { ok: true; dna: SynthesizedDNA; steps: BrowserAgentStep[] } | { ok: false; error: string }
> {
  let ctx = initialCtx;
  const qualifyFn: QualifyCaptureFn =
    qualifyCapture ??
    ((input) =>
      Promise.resolve(
        heuristicQualification({
          ...input,
          segmentIndex: input.segmentIndex ?? 0,
          scrollY: input.scrollY ?? 0,
        }),
      ));

  try {
    for (let stepNumber = 1; stepNumber <= ctx.maxSteps; stepNumber++) {
      const instructions = await withTimeout(
        fetchInstructions(ctx.jobId),
        STEP_TIMEOUT_MS,
        "fetchInstructions",
      );
      if (instructions.length > 0) {
        ctx = { ...ctx, instructions };
        if (reportTracker) {
          for (const inst of instructions) {
            if (inst.role === "user") {
              await reportTracker.recordInstruction(inst.content);
            }
          }
        }
        await withTimeout(markConsumed(ctx.jobId), STEP_TIMEOUT_MS, "markConsumed");
      }

      if (resolveScope) {
        ctx = { ...ctx, extractionScope: resolveScope() };
      }

      // Capture screenshot for planner vision
      const shot = await tools
        .takeScreenshot(ctx.sandboxId, ctx.sandboxAccessToken, false)
        .catch(() => ({ base64: "" }));
      const screenshotBase64 = shot.base64
        ? `data:image/png;base64,${shot.base64}`
        : undefined;

      const plan = await withTimeout(
        planner(ctx, screenshotBase64),
        STEP_TIMEOUT_MS,
        "planner",
      );

      await appendJobEvent(supabase, ctx.jobId, "agent_thought", {
        step: stepNumber,
        thought: plan.thought,
      });
      await appendJobEvent(supabase, ctx.jobId, "agent_action", {
        step: stepNumber,
        action: plan.action,
      });

      const rawObservation = await withTimeout(
        executeAction(ctx, plan.action, tools),
        STEP_TIMEOUT_MS,
        `executeAction:${plan.action.type}`,
      );

      const observation = await withTimeout(
        finalizeObservation(
          supabase,
          ctx,
          qualifyFn,
          plan.action,
          rawObservation,
          captureHooks(reportTracker),
        ),
        STEP_TIMEOUT_MS,
        "finalizeObservation",
      );

      if (reportTracker && plan.action.type === "navigate") {
        await reportTracker.recordPageVisit(plan.action.params.url);
      }

      await appendJobEvent(supabase, ctx.jobId, "agent_observation", {
        step: stepNumber,
        observation: sanitizeObservationForEvidence(observation),
      });

      const step: BrowserAgentStep = {
        stepNumber,
        thought: plan.thought,
        action: plan.action,
        observation,
        timestamp: new Date().toISOString(),
      };

      ctx = addStep(ctx, step);

      if (plan.dnaPartial && Object.keys(plan.dnaPartial).length > 0) {
        ctx = { ...ctx, dnaPartial: { ...ctx.dnaPartial, ...plan.dnaPartial } };
      }

      if (plan.done || isCycleDetected(ctx.steps, 3)) {
        break;
      }
    }

    const dna = await withTimeout(
      synthesizer(ctx.steps, ctx.url, ctx.categories),
      STEP_TIMEOUT_MS,
      "synthesizer",
    );
    await appendJobEvent(supabase, ctx.jobId, "agent_done", {
      dnaSummary: dna.name,
    });

    return { ok: true, dna, steps: ctx.steps };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendJobEvent(supabase, ctx.jobId, "agent_error", { error: msg });
    return { ok: false, error: msg };
  }
}

export function createDefaultCdpTools(): CdpTools {
  return {
    takeScreenshot,
    capturePageSegments,
    navigateTo,
    scrollPage,
    analyzeElement,
    getUrl,
    clickElement,
    typeText,
    evaluateJs,
  };
}
