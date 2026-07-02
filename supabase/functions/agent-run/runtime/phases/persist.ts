// runtime/phases/persist.ts — Persistência de mensagens e checkpoints (Fase 2.2)
import {
  defaultOperationSnapshot,
  type CheckpointExtra,
  serializeCheckpointPayload,
} from "../../checkpoint.ts";
import { buildExecutionLogMeta } from "../../executionLogMeta.ts";
import { logger } from "../../../_shared/logger.ts";
import { capMetaSize } from "../loop-config.ts";
import {
  buildCardSnapshot,
  type PersistContextUsage,
  type BuildCardSnapshotOpts,
} from "./snapshot.ts";
import type { CanonicalBuildSession } from "../build-session.ts";
import type { AgentState, ChatResponse, ProposedPlan, ToolCall, ToolResult } from "../../types.ts";
import { LoopPhase } from "../../types.ts";

export const CHECKPOINT_INTERVAL_STEPS = 2;

export type PersistFinalOpts = {
  lastFinishOk?: boolean;
  buildFailed?: boolean;
  awaiting?: boolean;
  awaitingKind?: "clarify" | "plan_approval" | null;
  conversational?: boolean;
  designSignature?: Record<string, unknown>;
  clarifyQuestions?: Array<{
    id: string;
    intro?: string;
    question: string;
    multiple?: boolean;
    choices: Array<{ id: string; label: string; description?: string }>;
  }>;
  finished?: boolean; // allow resumable/early terminal messages to not force finished:true on card (AC1 + resumable semantics)
};

export type AgentPersistDeps = {
  sb: any;
  runId: string | null;
  state: AgentState;
  getLastRunMessageId: () => string | null;
  setLastRunMessageId: (id: string | null) => void;
  getMaxStepsLimit: () => number;
  getComplexityScore: () => number;
  touchedPaths: Set<string>;
  narrationBuffer: string;
  tailSlice: (count: number) => unknown[];
  getTimeline: () => Array<{ type: string; data: Record<string, unknown>; timestamp?: number }>;
  runStartTime: number;
  getLastCheckpointStep: () => number;
  setLastCheckpointStep: (step: number) => void;
  getBuildSession: () => CanonicalBuildSession | null;
  getContextUsage: () => PersistContextUsage | null;
  getDirectiveEmitted: () => boolean;
  getValidationGeneration: () => number;
  getOperationStartedAt: () => string;
  emit: (type: string, data: unknown) => void;
};

function cardSnapshotForPersist(
  deps: AgentPersistDeps,
  opts: BuildCardSnapshotOpts,
): Record<string, unknown> {
  return buildCardSnapshot({
    timeline: deps.getTimeline(),
    narrationBuffer: deps.narrationBuffer,
    runStartTime: deps.runStartTime,
    runId: deps.runId,
    projectId: deps.state.projectId,
    currentStepIndex: deps.state.currentStepIndex,
    maxStepsLimit: deps.getMaxStepsLimit(),
    buildSession: deps.getBuildSession(),
    opts,
    contextUsage: deps.getContextUsage(),
  });
}

async function touchProjectUpdatedAt(deps: AgentPersistDeps): Promise<void> {
  await deps.sb
    .from("projects")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deps.state.projectId);
}

export async function resolveExistingRunMessageId(deps: AgentPersistDeps): Promise<string | null> {
  const cached = deps.getLastRunMessageId();
  if (cached) return cached;
  if (!deps.runId) return null;
  try {
    const query = deps.sb
      .from("messages")
      .select("id")
      .eq("conversation_id", deps.state.conversationId)
      .eq("role", "assistant");
    const filtered =
      typeof query.filter === "function" ? query.filter("meta->>runId", "eq", deps.runId) : query;
    const ordered =
      typeof filtered.order === "function"
        ? filtered.order("created_at", { ascending: false })
        : filtered;
    const limited = typeof ordered.limit === "function" ? ordered.limit(1) : ordered;
    const { data: existing } = await limited.maybeSingle();
    const id = (existing as { id?: string } | null)?.id ?? null;
    if (id) deps.setLastRunMessageId(id);
    return id;
  } catch {
    return null;
  }
}

export async function persistAssistantStep(
  deps: AgentPersistDeps,
  response: ChatResponse,
): Promise<string | null> {
  const tool_calls = (response.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.name,
    args: tc.arguments,
    status: "running",
  }));
  const meta: Record<string, unknown> = {
    runId: deps.runId ?? undefined,
    step: deps.state.currentStepIndex,
    partial: true,
  };
  const stepText = (response.content ?? "").trim();

  const existingId = await resolveExistingRunMessageId(deps);
  if (existingId) {
    let parts: Array<{ type: string; text: string }> = [];
    if (stepText) {
      const { data: existing } = await deps.sb
        .from("messages")
        .select("parts")
        .eq("id", existingId)
        .maybeSingle();
      const prevParts =
        (existing as { parts?: Array<{ type?: string; text?: string }> } | null)?.parts ?? [];
      const prevText = prevParts
        .filter((p) => p?.type === "text" && typeof p.text === "string")
        .map((p) => p.text!.trim())
        .filter(Boolean)
        .join("\n\n");
      const merged = [prevText, stepText].filter(Boolean).join("\n\n");
      parts = merged ? [{ type: "text", text: merged }] : [];
    }
    await deps.sb
      .from("messages")
      .update({
        ...(parts.length > 0 ? { parts } : {}),
        tool_calls,
        meta,
      })
      .eq("id", existingId);
    return existingId;
  }

  const { data } = await deps.sb
    .from("messages")
    .insert({
      conversation_id: deps.state.conversationId,
      role: "assistant",
      parts: stepText ? [{ type: "text", text: stepText }] : [],
      tool_calls,
      meta,
    })
    .select("id")
    .single();
  const id = data?.id ?? null;
  if (id) deps.setLastRunMessageId(id);
  return id;
}

export async function updateAssistantStep(
  deps: AgentPersistDeps,
  msgId: string,
  response: ChatResponse,
  execResults: Array<{ call: ToolCall; result: ToolResult }>,
  step: number,
): Promise<void> {
  const execMap = new Map(execResults.map((r) => [r.call.id, r.result]));
  const tool_calls = (response.tool_calls ?? []).map((tc) => {
    const result = execMap.get(tc.id);
    const hasResult = result !== undefined;
    return {
      id: tc.id,
      name: tc.name,
      args: tc.arguments,
      status: hasResult ? (result.ok ? "ok" : "error") : "running",
      error: hasResult ? (result.error ?? null) : null,
      artifacts: hasResult ? (result.artifacts ?? []) : [],
    };
  });
  const meta = buildExecutionLogMeta(null, deps.state.executionLog, step);
  await deps.sb.from("messages").update({ tool_calls, meta }).eq("id", msgId);
}

export async function persistFinal(
  deps: AgentPersistDeps,
  summary: string,
  opts?: PersistFinalOpts,
): Promise<void> {
  const conversational = opts?.conversational === true;
  const deliveryFiles = [...deps.touchedPaths];
  const closing = summary.trim();
  const text = conversational ? closing : closing;
  const lastFinishOk = opts?.lastFinishOk ?? true;
  const finished = opts?.finished ?? true;
  const cardSnapshot = cardSnapshotForPersist(deps, {
    streamText: text,
    deliveryFiles,
    finished,
    lastFinishOk,
    awaiting: opts?.awaiting,
    awaitingKind: opts?.awaitingKind,
    conversational,
    phase: opts?.awaiting ? null : "done",
    clarifyQuestions: opts?.clarifyQuestions,
  });
  const meta: Record<string, unknown> = {
    runId: deps.runId ?? undefined,
    partial: false,
    conversational: conversational || undefined,
    deliveryFiles,
    executionLog: deps.state.executionLog,
    finishedAt: finished ? new Date().toISOString() : undefined,
    currentStep: deps.state.currentStepIndex,
    totalSteps: deps.getMaxStepsLimit(),
    lastFinishOk,
    buildFailed: opts?.buildFailed === true || lastFinishOk === false,
    streamTail: deps.tailSlice(120),
    buildSession: deps.getBuildSession(),
    cardSnapshot,
    narrationText:
      typeof cardSnapshot.narrationText === "string" ? cardSnapshot.narrationText : undefined,
  };
  const cappedMeta = capMetaSize(meta);

  const existingId = await resolveExistingRunMessageId(deps);
  if (existingId) {
    await deps.sb
      .from("messages")
      .update({
        parts: [{ type: "text", text }],
        tool_calls: [],
        meta: cappedMeta,
      })
      .eq("id", existingId);
  } else {
    await deps.sb.from("messages").insert({
      conversation_id: deps.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text }],
      tool_calls: [],
      meta: cappedMeta,
    });
  }

  if (lastFinishOk && opts?.designSignature && deps.state.projectId) {
    await deps.sb
      .from("projects")
      .update({ design_signature: opts.designSignature })
      .eq("id", deps.state.projectId);
  }
  await touchProjectUpdatedAt(deps);
}

export async function persistPlanFinal(
  deps: AgentPersistDeps,
  summary: string,
  plan: ProposedPlan,
): Promise<void> {
  const cardSnapshot = cardSnapshotForPersist(deps, {
    streamText: summary,
    deliveryFiles: [],
    finished: true,
    lastFinishOk: true,
    awaiting: true,
    awaitingKind: "plan_approval",
    pendingPlan: plan,
    phase: null,
  });
  const meta: Record<string, unknown> = {
    runId: deps.runId ?? undefined,
    partial: false,
    projectId: deps.state.projectId,
    planMode: true,
    planStatus: "pending",
    planId: plan.planId,
    planSummary: plan.summary,
    planRationale: plan.rationale ?? null,
    planMission: plan.mission ?? null,
    planObjective: plan.objective ?? null,
    planMarkdown: plan.markdown ?? null,
    planAssumptions: plan.assumptions ?? null,
    planOutOfScope: plan.outOfScope ?? null,
    planPhases: plan.phases ?? null,
    planSteps: plan.steps,
    design: plan.design ?? null,
    finishedAt: new Date().toISOString(),
    buildSession: deps.getBuildSession(),
    cardSnapshot,
    narrationText:
      typeof cardSnapshot.narrationText === "string" ? cardSnapshot.narrationText : undefined,
  };

  const existingId = await resolveExistingRunMessageId(deps);
  if (existingId) {
    await deps.sb
      .from("messages")
      .update({
        parts: [{ type: "text", text: summary }],
        tool_calls: [],
        meta,
      })
      .eq("id", existingId);
    await touchProjectUpdatedAt(deps);
    return;
  }

  const { data } = await deps.sb
    .from("messages")
    .insert({
      conversation_id: deps.state.conversationId,
      role: "assistant",
      parts: [{ type: "text", text: summary }],
      tool_calls: [],
      meta,
    })
    .select("id")
    .single();
  const id = data?.id ?? null;
  if (id) deps.setLastRunMessageId(id);
  await touchProjectUpdatedAt(deps);
}

export async function clearCheckpoint(deps: AgentPersistDeps): Promise<void> {
  try {
    await deps.sb
      .from("agent_checkpoints")
      .delete()
      .eq("project_id", deps.state.projectId)
      .eq("conversation_id", deps.state.conversationId);
  } catch {
    /* não bloqueia conclusão */
  }
}

export async function saveCheckpoint(
  deps: AgentPersistDeps,
  phase: LoopPhase,
  force = false,
): Promise<void> {
  if (!deps.runId) return;
  const step = deps.state.currentStepIndex;
  if (!force && step - deps.getLastCheckpointStep() < CHECKPOINT_INTERVAL_STEPS) {
    return;
  }
  try {
    const extra: CheckpointExtra = {
      complexityScore: deps.getComplexityScore(),
      maxStepsLimit: deps.getMaxStepsLimit(),
    };
    const operation = defaultOperationSnapshot({
      touchedPaths: [...deps.touchedPaths],
      directiveEmitted: deps.getDirectiveEmitted(),
      buildSession: deps.getBuildSession(),
      validationGeneration: deps.getValidationGeneration(),
      operationStartedAt: deps.getOperationStartedAt(),
    });
    await deps.sb.from("agent_checkpoints").upsert(
      {
        project_id: deps.state.projectId,
        conversation_id: deps.state.conversationId,
        phase,
        state: serializeCheckpointPayload(deps.state, extra, operation),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,conversation_id" },
    );
    deps.setLastCheckpointStep(step);
  } catch (err) {
    logger.error("agent.checkpoint_save_failed", {
      runId: deps.runId ?? undefined,
      step,
      phase: phase as string,
      error: (err as Error)?.message,
    });
  }
}
