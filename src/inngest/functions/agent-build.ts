import { inngest } from "../client";
import { ensureTerminalRunMessage } from "./ensure-terminal-message";
import {
  drainPendingQueue,
  getRunStatus,
  getSupabaseAdmin,
  markRunFinal,
  resolveChunkResumeDecision,
  runAgentLoopWithResume,
  type AgentRunRequest,
} from "./_shared";

class NonRetriableError extends Error {
  override readonly name = "NonRetriableError";
}

export const agentBuildFunction = inngest.createFunction(
  {
    id: "agent-build",
    name: "Agent: Build Mode",
    retries: 0,
    concurrency: { limit: 5 },
    timeouts: { finish: "14m" },
    triggers: [{ event: "agent/build.requested" }],
  },
  async ({ event, step }) => {
    const payload = event.data as AgentRunRequest;
    const { runId } = payload;

    const initialStatus = await step.run("check-not-canceled", async () => {
      const status = await getRunStatus(runId);
      if (status === "canceled") {
        throw new NonRetriableError(`Run ${runId} was canceled before start`);
      }
      return status;
    });

    if (initialStatus === "completed" || initialStatus === "failed") {
      return { runId, ok: true, alreadyDone: true };
    }

    await step.run("mark-running", async () => {
      await markRunFinal(runId, "running");
    });

    await step.run("lease-agent-job", async () => {
      const { leaseQueuedAgentJob } = await import("./agent-jobs.ts");
      return await leaseQueuedAgentJob(getSupabaseAdmin(), runId);
    });

    const final = await runAgentLoopWithResume(
      step as Parameters<typeof runAgentLoopWithResume>[0],
      payload,
      false,
    );

    if (final.canceled) {
      await step.run("mark-canceled", async () => {
        await markRunFinal(runId, "canceled", { error: final.error ?? "canceled" });
      });
      await step.run("ensure-terminal-message-canceled", async () => {
        return await ensureTerminalRunMessage({
          runId,
          conversationId: payload.conversationId,
          projectId: payload.projectId,
          error: final.error ?? "canceled",
        });
      });
      // H6 fix: drain pending queue after cancel. Sem isso, mensagens
      // enfileiradas durante a run ficam stuck — o usuário tinha que
      // enviar nova mensagem para destravar o drain.
      await step.run("drain-pending-queue-after-cancel", async () => {
        return await drainPendingQueue(payload);
      });
      return { runId, ok: false, canceled: true };
    }

    if (!final.ok && !final.resumable) {
      await step.run("mark-failed", async () => {
        await markRunFinal(runId, "failed", { error: final.error ?? "agent failed" });
      });
      await step.run("drain-pending-queue-after-fail", async () => {
        return await drainPendingQueue(payload);
      });
      return { runId, ok: false, error: final.error };
    }

    if (!final.ok && final.resumable) {
      const decision = await step.run("resolve-chunk-resume", () =>
        resolveChunkResumeDecision(runId),
      );

      if (decision.action === "redispatch") {
        await step.sendEvent("re-dispatch-chunk", {
          name: "agent/build.requested",
          data: { ...payload, resume: true },
        });
        return { runId, ok: false, resumable: true, continued: true };
      }

      const exhaustedError = decision.error;
      await step.run("mark-failed-resumable-exhausted", async () => {
        await markRunFinal(runId, "failed", {
          error: exhaustedError,
          meta: {
            resumableExhausted: true,
            resumeAttempts: decision.chunkGeneration,
          },
        });
      });
      await step.run("ensure-terminal-message-resumable", async () => {
        return await ensureTerminalRunMessage({
          runId,
          conversationId: payload.conversationId,
          projectId: payload.projectId,
          error: exhaustedError,
          buildFailed: true,
        });
      });
      await step.run("emit-finish-resumable", async () => {
        const sb = getSupabaseAdmin();
        const { data: lastRow } = await sb
          .from("agent_stream_events")
          .select("seq")
          .eq("run_id", runId)
          .order("seq", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextSeq = (typeof lastRow?.seq === "number" ? lastRow.seq : 0) + 1;
        await sb.from("agent_stream_events").insert({
          id: crypto.randomUUID(),
          run_id: runId,
          seq: nextSeq,
          event_type: "finish",
          payload: {
            type: "finish",
            ok: false,
            canceled: false,
            resumable: false,
            error: exhaustedError,
            chunkCap: true,
            resumableExhausted: true,
            resumeAttempts: decision.chunkGeneration,
          },
        });
      });
      return { runId, ok: false, error: exhaustedError };
    }

    await step.run("mark-completed", async () => {
      const status = await getRunStatus(runId);
      if (status === "canceled" || status === "awaiting_user") return;
      await markRunFinal(runId, "completed");
    });

    // Bug #4: garantir linha assistant materializada mesmo em sucesso.
    await step.run("ensure-terminal-message-success", async () => {
      return await ensureTerminalRunMessage({
        runId,
        conversationId: payload.conversationId,
        projectId: payload.projectId,
        buildFailed: false,
      });
    });

    await step.run("drain-pending-queue", async () => {
      const status = await getRunStatus(runId);
      if (status === "awaiting_user") return { continued: false };
      return await drainPendingQueue(payload);
    });

    return {
      runId,
      ok: final.ok,
      stepsCompleted: final.stepsCompleted,
    };
  },
);
