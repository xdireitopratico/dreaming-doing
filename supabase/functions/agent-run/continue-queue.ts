/**
 * Drain agent_pending_messages após run completar (chamado via Inngest / service role).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { appendStreamEvent } from "../_shared/agent-stream.ts";
import {
  evaluateQueueDrain,
  popOldestPendingMessage,
} from "../_shared/agent-pending-queue.ts";
import { loadUserLlmContext, resolveAgentProvider } from "./run-setup.ts";
import type { AgentPreferencesPayload } from "./connector-keys.ts";

type InngestEventName = "agent/plan.requested" | "agent/build.requested";

export type ContinueQueueResult = {
  continued: boolean;
  runId?: string;
  pendingCount?: number;
  reason?: string;
};

export async function handleContinueQueue(
  supabase: SupabaseClient,
  inngestEventKey: string,
  input: {
    projectId: string;
    conversationId: string;
    userId: string;
    planMode?: boolean; // fallback only; prefer pendingBody.mode (send-time from queueMessage)
  },
): Promise<ContinueQueueResult> {
  const { projectId, conversationId, userId } = input;

  const decision = await evaluateQueueDrain(
    supabase,
    projectId,
    conversationId,
    userId,
  );

  if (!decision.shouldContinue) {
    return {
      continued: false,
      pendingCount: decision.pendingCount,
      reason: decision.blockingRunId
        ? `blocking_run:${decision.blockingRunId}`
        : decision.pendingCount === 0 && !decision.needsResponse
        ? "nothing_pending"
        : "blocked",
    };
  }

  const pendingBody = await popOldestPendingMessage(
    supabase,
    projectId,
    userId,
  );
  const preferences = (pendingBody?.preferences ?? null) as
    | AgentPreferencesPayload
    | null;
  const pendingSessionKind = typeof pendingBody?.sessionKind === "string"
    ? pendingBody.sessionKind
    : null;

  // PR3: prefer send-time mode captured at onSend (stored in pendingBody at enqueue time, or user msg meta)
  // over the drain/continue call input (which may come from prior run's planMode or current composer).
  // Fall back to input only if absent (keeps legacy queues as "build").
  const storedMode = typeof (pendingBody as any)?.mode === "string"
    ? String((pendingBody as any).mode).toLowerCase()
    : null;
  const planMode = storedMode === "plan"
    ? true
    : storedMode === "build"
    ? false
    : input.planMode === true;

  const { hasUserLlmKey, userOnlyKeys } = await loadUserLlmContext(
    supabase,
    userId,
    preferences,
  );
  const sessionKind = hasUserLlmKey ? "byok" : "taste_chat";
  const providerSessionKind =
    pendingSessionKind === "taste_start" || sessionKind === "taste_start"
      ? "taste_start"
      : "byok";

  if (sessionKind === "taste_chat") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("taste_chat_remaining, trial_messages_remaining")
      .eq("id", userId)
      .maybeSingle();
    const remaining = typeof profile?.taste_chat_remaining === "number"
      ? profile.taste_chat_remaining
      : typeof profile?.trial_messages_remaining === "number"
      ? profile.trial_messages_remaining
      : 50;
    if (remaining <= 0) {
      return {
        continued: false,
        pendingCount: decision.pendingCount,
        reason: "taste_limit",
      };
    }
  }

  const { data: lockedId, error: lockErr } = await supabase.rpc(
    "acquire_agent_run_lock",
    {
      p_project_id: projectId,
      p_conversation_id: conversationId,
      p_user_id: userId,
    },
  );

  if (lockErr || !lockedId) {
    return {
      continued: false,
      pendingCount: decision.pendingCount,
      reason: "lock_failed",
    };
  }

  const agentRunId = lockedId as string;

  let mainCfg;
  try {
    const setup = await resolveAgentProvider({
      supabase,
      userId,
      preferences,
      sessionKind: providerSessionKind,
      userOnlyKeys,
      tasteStartLabelPrefix: providerSessionKind === "taste_start",
    });
    mainCfg = setup.mainCfg;
    await supabase
      .from("agent_runs")
      .update({
        meta: {
          provider: mainCfg.label,
          model: mainCfg.model,
          sessionKind,
          continuedFromQueue: true,
        },
      })
      .eq("id", agentRunId);
  } catch (e) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: (e as Error).message,
      })
      .eq("id", agentRunId);
    return { continued: false, reason: "provider_setup_failed" };
  }

  const eventName: InngestEventName = planMode
    ? "agent/plan.requested"
    : "agent/build.requested";
  const eventPayload = {
    runId: agentRunId,
    projectId,
    conversationId,
    userId,
    sessionKind: hasUserLlmKey ? "byok" : "taste",
    preferences: preferences ?? {},
    planMode,
    resume: false,
  };

  // Reuse single hardened send helper from index.ts (owns INNGEST_EVENT_KEY check + loud fail)
  const { sendInngestEvent } = await import("./index.ts");
  const eventResult = await sendInngestEvent(
    eventName,
    eventPayload,
    inngestEventKey,
  );
  if (!eventResult.ok) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: `Inngest send failed: ${eventResult.error}`,
      })
      .eq("id", agentRunId);
    // Append finish so no run is left without terminal event (even on queue drain path)
    await appendStreamEvent(supabase, agentRunId, "finish", {
      type: "finish",
      ok: false,
      error: eventResult.error ?? "Inngest dispatch failed",
      resumable: false,
    });
    return { continued: false, reason: "inngest_failed" };
  }

  await appendStreamEvent(supabase, agentRunId, "start", {
    type: "start",
    runId: agentRunId,
    projectId,
    conversationId,
    provider: mainCfg.label,
    model: mainCfg.model,
    continuedFromQueue: true,
    mode: planMode ? "plan" : "build",
    eventId: eventResult.ids?.[0] ?? null,
  });

  const remaining = await evaluateQueueDrain(
    supabase,
    projectId,
    conversationId,
    userId,
  );

  return {
    continued: true,
    runId: agentRunId,
    pendingCount: remaining.pendingCount,
  };
}
