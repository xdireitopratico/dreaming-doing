import { inngest } from "../client";
import { ensureTerminalRunMessage } from "./ensure-terminal-message";
import {
  drainPendingQueue,
  getRunStatus,
  getSupabaseAdmin,
  markRunFinal,
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

    const final = await runAgentLoopWithResume(
      step as Parameters<typeof runAgentLoopWithResume>[0],
      payload,
      false,
    );

    if (final.canceled) {
      await step.run("mark-canceled", async () => {
        await markRunFinal(runId, "canceled", { error: final.error ?? "canceled" });
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
      const exhaustedError = final.error ?? "loop budget exhausted";
      await step.run("mark-failed-resumable-exhausted", async () => {
        await markRunFinal(runId, "failed", {
          error: exhaustedError,
          meta: { resumableExhausted: true, resumeAttempts: 3 },
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
          payload: { type: "finish", ok: false, canceled: false, resumable: false, error: exhaustedError },
        });
      });
      return { runId, ok: false, error: exhaustedError };
    }

    await step.run("mark-completed", async () => {
      const status = await getRunStatus(runId);
      if (status === "canceled" || status === "awaiting_user") return;
      await markRunFinal(runId, "completed");
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
