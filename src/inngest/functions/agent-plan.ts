import { inngest } from "../client";
import { ensureTerminalRunMessage } from "./ensure-terminal-message";
import {
  drainPendingQueue,
  getRunStatus,
  getSupabaseAdmin,
  markRunFinal,
  NonRetriableError,
  runAgentLoopWithResume,
  type AgentRunRequest,
} from "./_shared";

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
      { ...payload, planMode: true, chatMode: false },
    );

    if (final.canceled) {
      await step.run("mark-canceled", async () => {
        await markRunFinal(runId, "canceled", { error: final.error ?? "canceled" });
      });
      return { runId, ok: false, canceled: true };
    }

    if (!final.ok) {
      const status = await step.run("check-awaiting-status", async () => getRunStatus(runId));
      const isAwaiting = final.awaiting === true || status === "awaiting_user";

      if (!isAwaiting) {
        await step.run("mark-failed", async () => {
          await markRunFinal(runId, "failed", { error: final.error ?? "agent failed" });
        });
        await step.run("drain-pending-queue-after-fail", async () => {
          return await drainPendingQueue(payload);
        });
        return { runId, ok: false, error: final.error };
      }
    }

    await step.run("mark-completed", async () => {
      const status = await getRunStatus(runId);
      if (status === "canceled" || status === "awaiting_user") return;
      await markRunFinal(runId, "completed", { meta: { plan: final.plan ?? null } });
    });

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
      plan: final.plan,
      stepsCompleted: final.stepsCompleted,
    };
  },
);
