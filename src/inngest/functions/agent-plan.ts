import { inngest } from "../client";
import {
  drainPendingQueue,
  getRunStatus,
  markRunFinal,
  runAgentLoopWithResume,
  type AgentRunRequest,
} from "./_shared";

class NonRetriableError extends Error {
  override readonly name = "NonRetriableError";
}

export const agentPlanFunction = inngest.createFunction(
  {
    id: "agent-plan",
    name: "Agent: Plan Mode",
    retries: 0,
    concurrency: { limit: 5 },
    timeouts: { finish: "14m" },
    triggers: [{ event: "agent/plan.requested" }],
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

    if (
      initialStatus === "completed" ||
      initialStatus === "failed" ||
      initialStatus === "awaiting_user"
    ) {
      return { runId, ok: true, alreadyDone: true };
    }

    await step.run("mark-running", async () => {
      await markRunFinal(runId, "running");
    });

    const final = await runAgentLoopWithResume(
      step as Parameters<typeof runAgentLoopWithResume>[0],
      payload,
      true,
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
      await step.run("mark-failed-resumable-exhausted", async () => {
        await markRunFinal(runId, "failed", {
          error: final.error ?? "loop budget exhausted",
          meta: { resumableExhausted: true, resumeAttempts: 3 },
        });
      });
      return { runId, ok: false, error: final.error ?? "loop budget exhausted" };
    }

    await step.run("mark-completed", async () => {
      const status = await getRunStatus(runId);
      if (status === "canceled" || status === "awaiting_user") return;
      await markRunFinal(runId, "completed", { meta: { plan: final.plan ?? null } });
    });

    await step.run("drain-pending-queue", async () => {
      const status = await getRunStatus(runId);
      if (status === "awaiting_user") return { continued: false };
      return await drainPendingQueue(payload);
    });

    return {
      runId,
      ok: final.ok,
      plan: final.plan,
      stepsCompleted: final.stepsCompleted,
    };
  },
);
