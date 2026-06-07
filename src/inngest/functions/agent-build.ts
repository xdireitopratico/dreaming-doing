import { inngest } from "../client";
import {
  callAgentRunExecutor,
  getRunStatus,
  markRunFinal,
  type AgentRunRequest,
} from "./_shared";

const MAX_CHUNKS = 12;
const CHUNK_SLEEP = "2s";

class NonRetriableError extends Error {
  override readonly name = "NonRetriableError";
}

export const agentBuildFunction = inngest.createFunction(
  {
    id: "agent-build",
    name: "Agent: Build Mode",
    retries: 2,
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

    let resume = false;
    let lastResult: Awaited<ReturnType<typeof callAgentRunExecutor>> | null = null;
    let chunk = 0;

    while (chunk < MAX_CHUNKS) {
      const result = await step.run(`execute-chunk-${chunk}`, async () => {
        return await callAgentRunExecutor({ ...payload, action: "execute", planMode: false });
      });
      lastResult = result;
      chunk++;

      if (result.ok) break;
      if (result.canceled) {
        await step.run("mark-canceled", async () => {
          await markRunFinal(runId, "canceled", { error: result.error ?? "canceled" });
        });
        return { runId, ok: false, canceled: true };
      }
      if (!result.resumable) {
        await step.run("mark-failed", async () => {
          await markRunFinal(runId, "failed", { error: result.error ?? "agent failed" });
        });
        return { runId, ok: false, error: result.error };
      }

      resume = true;
      await step.sleep(`wait-chunk-${chunk}`, CHUNK_SLEEP);
    }

    const final = lastResult;
    if (!final) {
      throw new Error(`No result produced for run ${runId} after ${chunk} chunks`);
    }
    if (!final.ok && final.resumable && chunk >= MAX_CHUNKS) {
      await step.run("mark-failed-chunk-limit", async () => {
        await markRunFinal(runId, "failed", { error: "chunk limit reached" });
      });
      return { runId, ok: false, error: "chunk limit reached" };
    }

    if (final.ok) {
      await step.run("mark-completed", async () => {
        const status = await getRunStatus(runId);
        if (status === "canceled") return;
        await markRunFinal(runId, "completed");
      });
    }

    return {
      runId,
      ok: final.ok,
      stepsCompleted: final.stepsCompleted,
      chunks: chunk,
      resumed: resume,
    };
  },
);
