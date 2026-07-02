import { inngest } from "../client";
import { ensureTerminalRunMessage } from "./ensure-terminal-message";
import {
  drainPendingQueue,
  getRunStatus,
  getSupabaseAdmin,
  markRunFinal,
  NonRetriableError,
  runAgentLoopOnce,
  type AgentRunRequest,
} from "./_shared";

export const agentChatFunction = inngest.createFunction(
  {
    id: "agent-chat",
    name: "Agent: Chat Mode",
    retries: 0,
    concurrency: { limit: 5 },
    timeouts: { finish: "5m" },
    triggers: [{ event: "agent/chat.requested" }],
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

    const final = await runAgentLoopOnce(
      step as Parameters<typeof runAgentLoopOnce>[0],
      { ...payload, planMode: false, chatMode: true },
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
      await markRunFinal(runId, "completed");
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
      return await drainPendingQueue(payload);
    });

    return {
      runId,
      ok: final.ok,
      stepsCompleted: final.stepsCompleted,
    };
  },
);