/**
 * P1.4: Server actions for plan approve / reject.
 *
 * Replaces the in-process plan_approve / plan_reject handlers in
 * agent-run/index.ts. No more awaitPlanDecision, no more polling, no more
 * gate. The frontend calls these directly when the user clicks Aprovar or
 * Rejeitar in the PlanModal.
 *
 * - plan_approve: create a new build run with the approved plan as input,
 *                 send `agent/build.requested` Inngest event, return new runId.
 * - plan_reject:  mark the current plan run as `completed`, insert a
 *                 graciosa message ("Ok. Vejo que rejeitou o plano atual. Como
 *                 posso melhora-lo?") into the chat, return rejectedRunId.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgentPreferences } from "@/lib/agent-preferences";
import type { ForgeSessionKind, TasteAction } from "@/lib/taste";

const INNGEST_GRACIOSA_MESSAGE =
  "Ok. Vejo que rejeitou o plano atual. Como posso melhora-lo?";

type DecideResponse = {
  ok: true;
  rejectedRunId?: string;
  approvedRunId?: string;
  newRunId?: string;
  eventId?: string | null;
  graciosaMessageId?: string;
};

const planApproveSchema = z.object({
  runId: z.string().uuid(),
  planId: z.string().min(1),
  plan: z.string().min(1),
  steps: z.array(z.unknown()).optional(),
});

const planRejectSchema = z.object({
  runId: z.string().uuid(),
  planId: z.string().min(1),
  reason: z.string().optional(),
});

export const planApprove = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planApproveSchema.parse(input))
  .handler(async ({ data, context }): Promise<DecideResponse> => {
    const { supabase, userId } = context;
    const { runId, plan, planId, steps } = data;

    const { data: run, error: rErr } = await supabase
      .from("agent_runs")
      .select("id, user_id, project_id, conversation_id, meta, status")
      .eq("id", runId)
      .single();
    if (rErr || !run || run.user_id !== userId) {
      throw new Error("Run não encontrada");
    }
    if (run.status !== "completed" && run.status !== "awaiting_user" && run.status !== "pending" && run.status !== "running") {
      throw new Error(`Run em status inválido: ${run.status}`);
    }

    const now = new Date().toISOString();
    const { data: newRun, error: insertErr } = await supabase
      .from("agent_runs")
      .insert({
        user_id: userId,
        project_id: run.project_id,
        conversation_id: run.conversation_id,
        status: "pending",
        started_at: now,
        meta: {
          planMode: false,
          planSourceRunId: runId,
          planId,
          planSummary: plan,
          steps: (steps ?? []) as unknown as never,
        },
      })
      .select("id")
      .single();
    if (insertErr || !newRun) {
      throw new Error(`Falha ao criar run de build: ${insertErr?.message ?? "unknown"}`);
    }

    const { data: planMsgs } = await supabase
      .from("messages")
      .select("id, meta")
      .eq("conversation_id", run.conversation_id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(30);
    const planMsg = (planMsgs ?? []).find((m) => {
      const meta = (m.meta ?? {}) as Record<string, unknown>;
      return meta.runId === runId && meta.planId === planId;
    });
    if (planMsg) {
      const prev = (planMsg.meta ?? {}) as Record<string, unknown>;
      await supabase
        .from("messages")
        .update({ meta: { ...prev, planStatus: "approved", planApprovedAt: now } })
        .eq("id", planMsg.id);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("integration_prefs")
      .eq("id", userId)
      .maybeSingle();
    const preferences = ((profile?.integration_prefs ?? {}) as { agent?: AgentPreferences }).agent ?? null;
    const sessionKind: ForgeSessionKind = preferences?.mode ? "byok" : "taste";
    const tasteAction: TasteAction | undefined = undefined;

    const eventKey = process.env.INNGEST_EVENT_KEY;
    let eventId: string | null = null;
    if (eventKey) {
      try {
        const res = await fetch("https://inn.gs/e/" + eventKey, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "agent/build.requested",
            data: {
              runId: newRun.id,
              projectId: run.project_id,
              conversationId: run.conversation_id,
              userId,
              sessionKind,
              tasteAction,
              preferences: preferences ?? {},
              planMode: false,
              plan,
              planSourceRunId: runId,
            },
            ts: Date.now(),
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as { ids?: string[] };
          eventId = body.ids?.[0] ?? null;
        }
      } catch {
        // Inngest send failure is non-fatal — the run row exists with status=pending,
        // the user can re-trigger via chat.
      }
    }

    return {
      ok: true,
      approvedRunId: runId,
      newRunId: newRun.id,
      eventId,
    };
  });

export const planReject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => planRejectSchema.parse(input))
  .handler(async ({ data, context }): Promise<DecideResponse> => {
    const { supabase, userId } = context;
    const { runId, planId } = data;

    const { data: run, error: rErr } = await supabase
      .from("agent_runs")
      .select("id, user_id, project_id, conversation_id, status, meta")
      .eq("id", runId)
      .single();
    if (rErr || !run || run.user_id !== userId) {
      throw new Error("Run não encontrada");
    }

    const now = new Date().toISOString();
    const prevMeta = (run.meta ?? {}) as Record<string, unknown>;

    const { error: updErr } = await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        finished_at: now,
        meta: { ...prevMeta, planMode: true, planRejected: true, rejectedAt: now, rejectedPlanId: planId },
      })
      .eq("id", runId);
    if (updErr) {
      throw new Error(`Falha ao atualizar run: ${updErr.message}`);
    }

    const { data: planMsgs } = await supabase
      .from("messages")
      .select("id, meta")
      .eq("conversation_id", run.conversation_id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(30);

    const planMsg = (planMsgs ?? []).find((m) => {
      const meta = (m.meta ?? {}) as Record<string, unknown>;
      return meta.runId === runId && meta.planId === planId;
    });

    if (planMsg) {
      const prev = (planMsg.meta ?? {}) as Record<string, unknown>;
      await supabase
        .from("messages")
        .update({
          meta: { ...prev, planStatus: "rejected", planRejectedAt: now },
        })
        .eq("id", planMsg.id);
    }

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: run.conversation_id,
        role: "assistant",
        parts: [{ type: "text", text: INNGEST_GRACIOSA_MESSAGE }],
        meta: { graciosa: true, planRejectedRunId: runId, planId },
      })
      .select("id")
      .single();
    if (msgErr) {
      throw new Error(`Falha ao inserir mensagem graciosa: ${msgErr.message}`);
    }

    return {
      ok: true,
      rejectedRunId: runId,
      graciosaMessageId: msg?.id,
    };
  });
