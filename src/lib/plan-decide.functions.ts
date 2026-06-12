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
import type { ForgeSessionKind } from "@/lib/taste";

function prefsFromRunMeta(meta: Record<string, unknown>): AgentPreferences | undefined {
  const raw = meta.preferences;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const p = raw as AgentPreferences;
  return p.mode ? p : undefined;
}

function sessionKindFromRunMeta(meta: Record<string, unknown>): ForgeSessionKind | undefined {
  const sk = meta.sessionKind;
  if (sk === "byok") return "byok";
  if (sk === "taste" || sk === "taste_chat" || sk === "taste_start") return "taste";
  return undefined;
}

const agentPreferencesSchema = z
  .object({
    mode: z.enum(["auto", "robin", "fixed"]).optional(),
    fixedPresetId: z.string().optional(),
    poolProvider: z.enum(["nvidia", "groq"]).optional(),
    robinPoolModelId: z.string().optional(),
    customModelId: z.string().optional(),
    useCustomModel: z.boolean().optional(),
    autoAllowedPresetIds: z.array(z.string()).optional(),
    userModelEntries: z
      .array(
        z.object({
          slug: z.string(),
          env: z.string(),
          label: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

const INNGEST_GRACIOSA_MESSAGE = "Vi que rejeitou o plano , como posso melhora-lo?";

// PLAN_APPROVED_PREFIX source of truth is run-context.ts (exported); literal aqui por cross-runtime.

type DecideResponse = {
  ok: true;
  rejectedRunId?: string;
  approvedRunId?: string;
  newRunId?: string;
  eventId?: string | null;
  graciosaMessageId?: string;
  approveUserMessageId?: string;
};

const planApproveSchema = z
  .object({
    runId: z.string().uuid(),
    planId: z.string().min(1),
    /** @deprecated use planDocument */
    plan: z.string().optional(),
    planHeadline: z.string().optional(),
    planDocument: z.string().optional(),
    steps: z.array(z.unknown()).optional(),
    preferences: agentPreferencesSchema.optional(),
    sessionKind: z.enum(["byok", "taste"]).optional(),
    enabledSkillIds: z.array(z.string()).optional(),
    enabledMcpIds: z.array(z.string()).optional(),
  })
  .refine((d) => !!(d.planDocument?.trim() || d.plan?.trim()), {
    message: "planDocument ou plan é obrigatório",
  });

const META_STEP_RE =
  /pedir (ao|à) usu[aá]rio|perguntar (ao|à) usu[aá]rio|colar o plano|compartilhe o plano|me diga onde est[aá]|pe[cç]a ao usu[aá]rio/i;

function isActionableStepDescription(description: string): boolean {
  const d = description.trim();
  if (!d) return false;
  return !META_STEP_RE.test(d);
}

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
    const { runId, planId, steps } = data;
    const planDocument = (data.planDocument ?? data.plan ?? "").trim();
    const planHeadline = (data.planHeadline?.trim() || planDocument.slice(0, 120)).trim();
    if (!planDocument) {
      throw new Error("Documento do plano vazio — gere ou edite o plano antes de aprovar.");
    }

    const enabledSteps = (steps ?? []).filter(
      (s) => s && typeof s === "object" && (s as { enabled?: boolean }).enabled !== false,
    );
    const stepDescriptions = enabledSteps
      .map((s) =>
        typeof s === "object" && s && "description" in s
          ? String((s as { description?: string }).description ?? "")
          : "",
      )
      .filter(Boolean);
    if (
      stepDescriptions.length > 0 &&
      stepDescriptions.every((d) => !isActionableStepDescription(d))
    ) {
      throw new Error(
        "Todos os passos são apenas conversacionais (ex.: pedir plano ao usuário). Edite o plano com ações concretas antes de aprovar.",
      );
    }

    const { data: run, error: rErr } = await supabase
      .from("agent_runs")
      .select("id, user_id, project_id, conversation_id, meta, status")
      .eq("id", runId)
      .single();
    if (rErr || !run || run.user_id !== userId) {
      throw new Error("Run não encontrada");
    }
    if (
      run.status !== "completed" &&
      run.status !== "awaiting_user" &&
      run.status !== "pending" &&
      run.status !== "running"
    ) {
      throw new Error(`Run em status inválido: ${run.status}`);
    }

    const sourceMeta = (run.meta ?? {}) as Record<string, unknown>;
    const preferences: AgentPreferences | null =
      (data.preferences?.mode ? (data.preferences as AgentPreferences) : undefined) ??
      prefsFromRunMeta(sourceMeta) ??
      null;
    const sessionKind: ForgeSessionKind =
      data.sessionKind ??
      sessionKindFromRunMeta(sourceMeta) ??
      (preferences?.mode ? "byok" : "taste");
    const enabledSkillIds =
      data.enabledSkillIds ??
      (Array.isArray(sourceMeta.enabledSkillIds) ? (sourceMeta.enabledSkillIds as string[]) : []);
    const enabledMcpIds =
      data.enabledMcpIds ??
      (Array.isArray(sourceMeta.enabledMcpIds) ? (sourceMeta.enabledMcpIds as string[]) : []);

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
          planHeadline,
          planDocument,
          planSummary: planDocument,
          steps: (steps ?? []) as unknown as never,
          preferences: (preferences ?? {}) as Record<string, unknown>,
          sessionKind,
          enabledSkillIds,
          enabledMcpIds,
        } as unknown as never,
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

    const stepLabels = (steps ?? [])
      .map((s) =>
        typeof s === "object" && s && "title" in s
          ? String((s as { title?: string }).title ?? "")
          : "",
      )
      .filter(Boolean);
    const approveText =
      stepLabels.length > 0
        ? `[Plano aprovado] Plano aprovado — executar em modo Build:\n${stepLabels.map((t) => `• ${t}`).join("\n")}`
        : `[Plano aprovado] Plano aprovado — executar em modo Build.`;

    const { data: approveUserMsg, error: approveUserErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: run.conversation_id,
        role: "user",
        parts: [{ type: "text", text: approveText }],
        meta: {
          kind: "plan_approved",
          planSourceRunId: runId,
          planId,
          buildRunId: newRun.id,
        },
      })
      .select("id")
      .single();
    if (approveUserErr) {
      throw new Error(`Falha ao registrar aprovação no chat: ${approveUserErr.message}`);
    }

    // Use hardened dispatch_build action in Edge (single owner of INNGEST_EVENT_KEY check+send).
    // On failure the action appends "finish", deletes the pending run (no orphan pending-without-events),
    // and returns loud error. We keep defensive deletes here for invoke-level failures.
    const { data: dispatchResult, error: dispatchErr } = await supabase.functions.invoke(
      "agent-run",
      { body: { action: "dispatch_build", runId: newRun.id } },
    );
    if (dispatchErr) {
      await supabase.from("agent_runs").delete().eq("id", newRun.id);
      throw new Error(`Falha ao disparar build: ${dispatchErr.message}`);
    }

    const dispatchBody = (dispatchResult ?? {}) as { error?: string; eventId?: string | null };
    if (dispatchBody.error) {
      await supabase.from("agent_runs").delete().eq("id", newRun.id);
      throw new Error(dispatchBody.error);
    }

    const eventId = dispatchBody.eventId ?? null;
    // ensure !eventId throws loud (no silent ok path) — required by hardened central dispatch contract
    if (!eventId) {
      await supabase.from("agent_runs").delete().eq("id", newRun.id);
      throw new Error(
        "Build não iniciou — configure INNGEST_EVENT_KEY nas secrets da Edge (docs/EDGE-SECRETS.md).",
      );
    }

    const { awaitingUser: _awaitingUser, ...sourceMetaWithoutAwaiting } = sourceMeta;
    const { error: closePlanRunErr } = await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        finished_at: now,
        meta: {
          ...sourceMetaWithoutAwaiting,
          planApproved: true,
          planApprovedAt: now,
          buildRunId: newRun.id,
        },
      })
      .eq("id", runId);
    if (closePlanRunErr) {
      throw new Error(`Falha ao encerrar run do plano: ${closePlanRunErr.message}`);
    }

    return {
      ok: true,
      approvedRunId: runId,
      newRunId: newRun.id,
      eventId,
      approveUserMessageId: approveUserMsg?.id,
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
        meta: {
          ...prevMeta,
          planMode: true,
          planRejected: true,
          rejectedAt: now,
          rejectedPlanId: planId,
        },
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
