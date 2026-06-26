import { inngest } from "../client";
import { NonRetriableError } from "./_shared";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function invokeGatewayStep(executionId: string): Promise<{
  done: boolean;
  status: string;
  paused?: boolean;
  steps_count?: number;
}> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new NonRetriableError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing for gateway worker");
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/aetherforge-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "execute_step",
      execution_id: executionId,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`gateway execute_step HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }

  const status = String(body.status || "");
  const done = status === "completed" || status === "failed" || status === "paused";
  return {
    done,
    status,
    paused: status === "paused",
    steps_count: body.steps_count,
  };
}

export const gatewayFlowFunction = inngest.createFunction(
  {
    id: "gateway-flow-execute",
    name: "AetherForge: Gateway Flow Execute",
    retries: 2,
    concurrency: { limit: 5 },
    timeouts: { finish: "4h" },
    triggers: [{ event: "aetherforge/flow.execute" }],
  },
  async ({ event, step }) => {
    const executionId = event.data?.execution_id as string | undefined;
    if (!executionId) {
      throw new NonRetriableError("execution_id is required");
    }

    let stepIndex = 0;
    let lastStatus = "running";

    while (stepIndex < 500) {
      const result = await step.run(`gateway-step-${stepIndex}`, async () => {
        return await invokeGatewayStep(executionId);
      });

      lastStatus = result.status;
      if (result.done) {
        return {
          execution_id: executionId,
          ok: result.status === "completed",
          status: result.status,
          steps_count: result.steps_count,
          paused: result.paused,
        };
      }

      stepIndex++;
    }

    throw new NonRetriableError(`Gateway execution ${executionId} exceeded step budget (500)`);
  },
);