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

    const final = await runAgentLoopOnce(
      step as Parameters<typeof runAgentLoopOnce>[0],
      { ...payload, planMode: false, chatMode: false },
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
