/**
 * Drain agent_pending_messages após run completar (chamado via Inngest / service role).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { appendStreamEvent } from "../_shared/agent-stream.ts";
import {
  commitPendingAfterDispatch,
  countPendingMessages,
  evaluateQueueDrain,
  latestUserMessageSnapshot,
  materializeQueuedUserMessage,
  peekOldestPendingMessage,
  resolveQueuedRunMode,
  type QueuedRunMode,
} from "../_shared/agent-pending-queue.ts";
import {
  loadUserLlmContext,
  resolveAgentProvider,
  resolveEffectiveAgentPreferences,
} from "./run-setup.ts";
import { enqueueAgentJobOnDispatch } from "../_shared/agent-jobs.ts";
import { transitionRun } from "../_shared/run-lifecycle.ts";

type InngestEventName =
  | "agent/chat.requested"
  | "agent/plan.requested"
  | "agent/build.requested";

function inngestEventForMode(mode: QueuedRunMode): InngestEventName {
  if (mode === "chat") return "agent/chat.requested";
  if (mode === "plan") return "agent/plan.requested";
  return "agent/build.requested";
}

const ACQUIRE_LOCK_RETRIES = 3;
const ACQUIRE_LOCK_BASE_DELAY_MS = 350;

async function acquireAgentRunLockWithRetry(
  supabase: SupabaseClient,
  projectId: string,
  conversationId: string,
  userId: string,
): Promise<{ lockedId: string | null; lockErr: unknown }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < ACQUIRE_LOCK_RETRIES; attempt += 1) {
    const { data: lockedId, error: lockErr } = await supabase.rpc("acquire_agent_run_lock", {
      p_project_id: projectId,
      p_conversation_id: conversationId,
      p_user_id: userId,
    });

    if (!lockErr && lockedId) {
      return { lockedId, lockErr: null };
    }

    lastErr = lockErr;
    if (attempt < ACQUIRE_LOCK_RETRIES - 1) {
      await new Promise((resolve) => {
        const delay = ACQUIRE_LOCK_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 250);
        setTimeout(resolve, delay);
      });
    }
  }

  return { lockedId: null, lockErr: lastErr };
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
    planMode?: boolean; // fallback only; prefer pendingBody.mode (send-time from queueMessage)
    chatMode?: boolean;
  },
): Promise<ContinueQueueResult> {
  const { projectId, conversationId, userId } = input;

  const decision = await evaluateQueueDrain(supabase, projectId, conversationId, userId);

  if (!decision.shouldContinue) {
    const { getProjectQueuePaused } = await import("../_shared/agent-pending-queue.ts");
    const queuePaused = await getProjectQueuePaused(supabase, projectId);
    return {
      continued: false,
      pendingCount: decision.pendingCount,
      reason: queuePaused
        ? "queue_paused"
        : decision.blockingRunId
          ? `blocking_run:${decision.blockingRunId}`
          : decision.pendingCount === 0 && !decision.needsResponse
            ? "nothing_pending"
            : "blocked",
    };
  }

  const pendingPeek = await peekOldestPendingMessage(supabase, projectId, userId);
  let pendingRowId: string | null = pendingPeek?.id ?? null;
  let pendingBody: Record<string, unknown> | null = pendingPeek?.body ?? null;

  if (!pendingBody && decision.needsResponse) {
    pendingBody = await latestUserMessageSnapshot(supabase, conversationId);
    pendingRowId = null;
  }

  if (!pendingBody) {
    return {
      continued: false,
      pendingCount: decision.pendingCount,
      reason: "nothing_pending",
    };
  }

  const materializedId = await materializeQueuedUserMessage(
    supabase,
    conversationId,
    pendingBody,
  );
  if (materializedId) {
    pendingBody = { ...pendingBody, messageId: materializedId };
  }

  const preferences = await resolveEffectiveAgentPreferences(supabase, userId);
  const pendingSessionKind =
    typeof pendingBody?.sessionKind === "string" ? pendingBody.sessionKind : null;

  // PR3 / S7: pendingBody.mode (enqueue) > user message meta > drain input (omit planMode from Inngest).
  let messageMetaMode: string | null = null;
  const pendingMessageId =
    typeof pendingBody?.messageId === "string" ? pendingBody.messageId : null;
  if (!pendingBody?.mode && pendingMessageId) {
    const { data: msgRow } = await supabase
      .from("messages")
      .select("meta")
      .eq("id", pendingMessageId)
      .maybeSingle();
    const raw = (msgRow?.meta as Record<string, unknown> | undefined)?.mode;
    messageMetaMode = typeof raw === "string" ? raw : null;
  }

  const queuedMode = resolveQueuedRunMode({
    pendingBody,
    messageMetaMode,
    inputPlanMode: input.planMode,
    inputChatMode: input.chatMode,
  });
  const planMode = queuedMode === "plan";
  const chatMode = queuedMode === "chat";

  const { hasUserLlmKey, userOnlyKeys } = await loadUserLlmContext(supabase, userId, preferences);
  const sessionKind = hasUserLlmKey ? "byok" : "taste_chat";
  const providerSessionKind =
    pendingSessionKind === "taste_start" || sessionKind === "taste_start" ? "taste_start" : "byok";

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
      const pendingCount = await countPendingMessages(supabase, projectId, userId);
      return {
        continued: false,
        pendingCount,
        reason: "taste_limit",
      };
    }
  }

  const { lockedId: lockedId, lockErr } = await acquireAgentRunLockWithRetry(
    supabase,
    projectId,
    conversationId,
    userId,
  );

  if (lockErr || !lockedId) {
    const pendingCount = await countPendingMessages(supabase, projectId, userId);
    return {
      continued: false,
      pendingCount,
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
    await transitionRun(supabase, agentRunId, "failed", { error: (e as Error).message });
    return { continued: false, reason: "provider_setup_failed" };
  }

  const eventName = inngestEventForMode(queuedMode);
  const eventPayload = {
    runId: agentRunId,
    projectId,
    conversationId,
    userId,
    sessionKind: hasUserLlmKey ? "byok" : "taste",
    preferences: preferences ?? {},
    planMode,
    chatMode,
    resume: false,
  };

  // Reuse single hardened send helper from index.ts (owns INNGEST_EVENT_KEY check + loud fail)
  const { sendInngestEvent } = await import("./index.ts");
  const eventResult = await sendInngestEvent(eventName, eventPayload, inngestEventKey);
  if (!eventResult.ok) {
    await transitionRun(supabase, agentRunId, "failed", {
      error: `Inngest send failed: ${eventResult.error}`,
    });
    // Append finish so no run is left without terminal event (even on queue drain path)
    await appendStreamEvent(supabase, agentRunId, "finish", {
      type: "finish",
      ok: false,
      error: eventResult.error ?? "Inngest dispatch failed",
      resumable: false,
    });
    return { continued: false, reason: "inngest_failed" };
  }

  await enqueueAgentJobOnDispatch(supabase, agentRunId, {
    planMode,
    chatMode,
    continuedFromQueue: true,
    eventName,
  });

  await appendStreamEvent(supabase, agentRunId, "start", {
    type: "start",
    runId: agentRunId,
    projectId,
    conversationId,
    provider: mainCfg.label,
    model: mainCfg.model,
    continuedFromQueue: true,
    mode: queuedMode,
    eventId: eventResult.ids?.[0] ?? null,
  });

  if (pendingRowId) {
    await commitPendingAfterDispatch(supabase, pendingRowId, pendingBody);
  }

  const remaining = await evaluateQueueDrain(supabase, projectId, conversationId, userId);

  return {
    continued: true,
    runId: agentRunId,
    pendingCount: remaining.pendingCount,
  };
}
