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

async function sendInngestEvent(
  eventKey: string,
  name: InngestEventName,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; ids?: string[]; error?: string }> {
  if (!eventKey) return { ok: false, error: "INNGEST_EVENT_KEY not configured" };
  try {
    const res = await fetch("https://inn.gs/e/" + eventKey, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data, ts: Date.now() }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Inngest ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = (await res.json()) as { ids?: string[] };
    return { ok: true, ids: body.ids };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

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
    planMode?: boolean;
  },
): Promise<ContinueQueueResult> {
  const { projectId, conversationId, userId } = input;
  const planMode = input.planMode === true;

  const decision = await evaluateQueueDrain(supabase, projectId, conversationId, userId);

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

  const pendingBody = await popOldestPendingMessage(supabase, projectId, userId);
  const preferences = (pendingBody?.preferences ?? null) as AgentPreferencesPayload | null;
  const pendingSessionKind = typeof pendingBody?.sessionKind === "string"
    ? pendingBody.sessionKind
    : null;

  const { hasUserLlmKey, userOnlyKeys } = await loadUserLlmContext(supabase, userId, preferences);
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
    const remaining =
      typeof profile?.taste_chat_remaining === "number"
        ? profile.taste_chat_remaining
        : typeof profile?.trial_messages_remaining === "number"
          ? profile.trial_messages_remaining
          : 50;
    if (remaining <= 0) {
      return { continued: false, pendingCount: decision.pendingCount, reason: "taste_limit" };
    }
  }

  const { data: lockedId, error: lockErr } = await supabase.rpc("acquire_agent_run_lock", {
    p_project_id: projectId,
    p_conversation_id: conversationId,
    p_user_id: userId,
  });

  if (lockErr || !lockedId) {
    return { continued: false, pendingCount: decision.pendingCount, reason: "lock_failed" };
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

  const eventName: InngestEventName = planMode ? "agent/plan.requested" : "agent/build.requested";
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

  const eventResult = await sendInngestEvent(inngestEventKey, eventName, eventPayload);
  if (!eventResult.ok) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: `Inngest send failed: ${eventResult.error}`,
      })
      .eq("id", agentRunId);
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

  const remaining = await evaluateQueueDrain(supabase, projectId, conversationId, userId);

  return {
    continued: true,
    runId: agentRunId,
    pendingCount: remaining.pendingCount,
  };
}