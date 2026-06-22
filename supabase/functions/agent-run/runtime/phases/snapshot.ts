// runtime/phases/snapshot.ts — Timeline → cardSnapshot (Fase 2.2)
import type { ProposedPlan } from "../../types.ts";

export type StreamTimelineEntry = {
  type: string;
  data: Record<string, unknown>;
  timestamp?: number;
};

export type TimelineToolEntry = {
  name: string;
  args: Record<string, unknown>;
  ok?: boolean;
  error?: string;
};

export type TimelineDiffEntry = {
  id: string;
  path: string;
  before: string;
  after: string;
  op: "write" | "edit";
  timestamp: number;
};

export function toolsFromTimeline(timeline: StreamTimelineEntry[]): TimelineToolEntry[] {
  const tools: TimelineToolEntry[] = [];
  for (const ev of timeline) {
    if (ev.type === "tool_start") {
      tools.push({
        name: typeof ev.data.name === "string" ? ev.data.name : "?",
        args: (ev.data.args as Record<string, unknown> | undefined) ?? {},
      });
      continue;
    }
    if (ev.type === "tool_done") {
      const toolName = typeof ev.data.name === "string" ? ev.data.name : "?";
      for (let i = tools.length - 1; i >= 0; i--) {
        if (tools[i].name === toolName && tools[i].ok === undefined) {
          tools[i] = {
            ...tools[i],
            ok: ev.data.ok === true,
            error: typeof ev.data.error === "string" ? ev.data.error : undefined,
          };
          break;
        }
      }
    }
  }
  return tools;
}

export function diffsFromTimeline(timeline: StreamTimelineEntry[]): TimelineDiffEntry[] {
  const diffs: TimelineDiffEntry[] = [];
  for (const ev of timeline) {
    if (ev.type !== "file_diff") continue;
    const path = typeof ev.data.path === "string" ? ev.data.path : "unknown";
    const before = typeof ev.data.before === "string" ? ev.data.before : "";
    const after = typeof ev.data.after === "string" ? ev.data.after : "";
    const op = ev.data.op === "edit" ? "edit" : "write";
    const ts = typeof ev.timestamp === "number" ? ev.timestamp : Date.now();
    diffs.push({
      id: `${path}::${diffs.length}::${ts}`,
      path,
      before,
      after,
      op,
      timestamp: ts,
    });
  }
  return diffs;
}

export function latencyThoughtMsFromTimeline(
  timeline: StreamTimelineEntry[],
  runStartTime: number,
): number | null {
  const first = timeline.find(
    (e) =>
      e.type === "assistant_text" &&
      typeof e.data?.text === "string" &&
      String(e.data.text).trim().length > 0,
  );
  if (!first) return null;
  const ts = typeof first.timestamp === "number" ? first.timestamp : Date.now();
  return Math.max(500, ts - runStartTime);
}

export type BuildCardSnapshotOpts = {
  streamText: string;
  deliveryFiles: string[];
  finished?: boolean;
  lastFinishOk?: boolean | null;
  awaiting?: boolean;
  awaitingKind?: "clarify" | "plan_approval" | null;
  pendingPlan?: ProposedPlan | null;
  conversational?: boolean;
  phase?: string | null;
  currentStep?: number | null;
  totalSteps?: number | null;
  error?: string | null;
  resumable?: boolean;
};

export type BuildCardSnapshotContext = {
  timeline: StreamTimelineEntry[];
  narrationBuffer: string;
  runStartTime: number;
  runId: string | null;
  projectId: string;
  currentStepIndex: number;
  maxStepsLimit: number;
  opts: BuildCardSnapshotOpts;
  now?: number;
};

export function buildCardSnapshot(ctx: BuildCardSnapshotContext): Record<string, unknown> {
  const { timeline, opts } = ctx;
  const tools = toolsFromTimeline(timeline);
  const diffs = diffsFromTimeline(timeline);
  const finished = opts.finished ?? true;
  const lastFinishOk = opts.lastFinishOk ?? (finished ? true : null);
  const narration = ctx.narrationBuffer.trim();
  const now = ctx.now ?? Date.now();

  let latencyThoughtMs = latencyThoughtMsFromTimeline(timeline, ctx.runStartTime);
  if (latencyThoughtMs == null && (opts.finished ?? true)) {
    latencyThoughtMs = Math.max(500, now - ctx.runStartTime);
  }

  const snapshot: Record<string, unknown> = {
    timeline,
    tools,
    diffs,
    streamText: opts.streamText,
    narrationText: narration || undefined,
    latencyThoughtMs: latencyThoughtMs ?? undefined,
    phase: opts.phase ?? (finished ? "done" : null),
    message: null,
    summary: null,
    error: opts.error ?? null,
    finished,
    resumable: opts.resumable ?? false,
    lastFinishOk,
    currentStep: opts.currentStep ?? ctx.currentStepIndex,
    totalSteps: opts.totalSteps ?? ctx.maxStepsLimit,
    deliveryFiles: opts.deliveryFiles,
    buildLogLines: [],
    stackForkSuggested: null,
    awaiting: opts.awaiting ?? false,
    awaitingKind: opts.awaitingKind ?? null,
    conversational: opts.conversational === true,
  };

  if (opts.pendingPlan) {
    const plan = opts.pendingPlan;
    snapshot.pendingPlan = {
      planId: plan.planId,
      summary: plan.summary,
      rationale: plan.rationale ?? undefined,
      markdown: plan.markdown ?? undefined,
      mission: plan.mission ?? undefined,
      objective: plan.objective ?? undefined,
      steps: plan.steps,
      ttlMs: Number.MAX_SAFE_INTEGER,
      proposedAt: now,
      runId: ctx.runId ?? undefined,
      projectId: ctx.projectId,
    };
    snapshot.planSummary = plan.summary;
  }

  return snapshot;
}