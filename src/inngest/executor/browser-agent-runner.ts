import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrowserAgentContext,
  BrowserAgentStep,
  AgentAction,
  AgentObservation,
  UserInstruction,
} from "./browser-agent-state";
import { addStep, isCycleDetected } from "./browser-agent-state";
import type { AgentPlan } from "./browser-agent-llm";
import type { SynthesizedDNA } from "./browser-agent-synthesis";
import { appendJobEvent } from "../functions/_shared-design-dna";
import {
  takeScreenshot,
  navigateTo,
  scrollPage,
  analyzeElement,
  getUrl,
  clickElement,
  typeText,
  evaluateJs,
} from "./browser-cdp-tools";

export type CdpTools = {
  takeScreenshot: typeof takeScreenshot;
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
      const res = await tools.takeScreenshot(
        ctx.sandboxId,
        ctx.sandboxAccessToken,
        action.params.fullPage,
      );
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

export async function runBrowserAgent(
  initialCtx: BrowserAgentContext,
  supabase: SupabaseClient,
  tools: CdpTools,
  planner: PlannerFn,
  synthesizer: SynthesizerFn,
  fetchInstructions: FetchInstructionsFn,
  markConsumed: MarkInstructionsConsumedFn,
): Promise<
  { ok: true; dna: SynthesizedDNA; steps: BrowserAgentStep[] } | { ok: false; error: string }
> {
  let ctx = initialCtx;

  try {
    for (let stepNumber = 1; stepNumber <= ctx.maxSteps; stepNumber++) {
      const instructions = await fetchInstructions(ctx.jobId);
      if (instructions.length > 0) {
        ctx = { ...ctx, instructions };
        await markConsumed(ctx.jobId);
      }

      // Capture screenshot for planner vision
      const shot = await tools.takeScreenshot(ctx.sandboxId, ctx.sandboxAccessToken, false).catch(() => ({ base64: "" }));
      const screenshotBase64 = shot.base64 ? `data:image/png;base64,${shot.base64}` : undefined;

      const plan = await planner(ctx, screenshotBase64);

      await appendJobEvent(supabase, ctx.jobId, "agent_thought", {
        step: stepNumber,
        thought: plan.thought,
      });
      await appendJobEvent(supabase, ctx.jobId, "agent_action", {
        step: stepNumber,
        action: plan.action,
      });

      const observation = await executeAction(ctx, plan.action, tools);

      await appendJobEvent(supabase, ctx.jobId, "agent_observation", {
        step: stepNumber,
        observation,
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

    const dna = await synthesizer(ctx.steps, ctx.url, ctx.categories);
    await appendJobEvent(supabase, ctx.jobId, "agent_done", { dnaSummary: dna.name });

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
    navigateTo,
    scrollPage,
    analyzeElement,
    getUrl,
    clickElement,
    typeText,
    evaluateJs,
  };
}
