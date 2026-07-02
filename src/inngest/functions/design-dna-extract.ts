import { inngest } from "../client";
import { errorMessage } from "@/lib/error-utils";
import { NonRetriableError } from "./_shared";
import {
  getSupabaseAdmin,
  markJobFinal,
  type DesignDnaJobRequest,
  type DesignDnaExecuteResponse,
} from "./_shared-design-dna";

export const designDnaExtractFunction = inngest.createFunction(
  {
    id: "design-dna-extract",
    name: "Design-DNA: Extract",
    retries: 0,
    concurrency: { limit: 3 },
    timeouts: { finish: "14m" },
    triggers: [{ event: "design-dna/extract.requested" }],
    onFailure: async ({ error, event }) => {
      const sb = getSupabaseAdmin();
      const failureData = event.data as Record<string, unknown>;
      const originalEvent = failureData.event as Record<string, unknown> | undefined;
      const originalData = originalEvent?.data as Record<string, unknown> | undefined;
      const jobId = originalData?.jobId as string | undefined;
      if (jobId) {
        const errMsg = typeof error === "object" && error && "message" in error
          ? (error as { message: string }).message
          : String(error ?? "unknown");
        await markJobFinal(sb, jobId, "failed", {
          error: `Inngest crash: ${errMsg}`,
        }).catch((e) => console.error("[onFailure] failed to mark job:", e));
      }
    },
  },
  async ({ event, step }) => {
    const payload = event.data as DesignDnaJobRequest;
    const { jobId } = payload;

    const initialStatus = await step.run("check-not-canceled", async () => {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from("design_dna_jobs")
        .select("status")
        .eq("id", jobId)
        .single();
      if (error) {
        throw new Error(`Failed to check job ${jobId}: ${error.message}`);
      }
      if (data?.status === "canceled") {
        throw new NonRetriableError(`Job ${jobId} was canceled before start`);
      }
      return data?.status as string | undefined;
    });

    if (initialStatus === "completed" || initialStatus === "partial" || initialStatus === "blocked" || initialStatus === "failed") {
      return { jobId, ok: true, alreadyDone: true };
    }

    await step.run("mark-running", async () => {
      const sb = getSupabaseAdmin();
      const { error } = await sb
        .from("design_dna_jobs")
        .update({ status: "running", heartbeat_at: new Date().toISOString() })
        .eq("id", jobId);
      if (error) {
        throw new Error(`Failed to mark job ${jobId} as running: ${error.message}`);
      }
    });

    let lastResult: DesignDnaExecuteResponse | null = null;
    let lastError: string | null = null;
    for (let i = 0; i < 3; i++) {
      await step.run(`heartbeat-${i}`, async () => {
        const sb = getSupabaseAdmin();
        await sb.from("design_dna_jobs").update({ heartbeat_at: new Date().toISOString() }).eq("id", jobId);
      });
      try {
        const result = await step.run(`extract-loop-${i}`, async () => {
          const { executeDesignDnaJob } = await import("../executor/run-design-dna.ts");
          const sb = getSupabaseAdmin();
          return await executeDesignDnaJob(sb, { ...payload, resume: i > 0 });
        });
        lastResult = result;
        if (result.ok || result.canceled || !result.resumable) break;
      } catch (err) {
        lastError = errorMessage(err);
        console.error(`[design-dna-extract] extract-loop-${i} threw:`, lastError);
        // Marcar como failed imediatamente em vez de propagar (que deixaria job em running)
        lastResult = {
          ok: false,
          jobId: payload.jobId,
          resumable: false,
          canceled: false,
          error: lastError,
          urlsCompleted: 0,
          durationMs: 0,
        };
        break;
      }
    }

    // Se houve erro fatal, marcar failed e sair
    if (lastError && !lastResult?.ok) {
      await step.run("mark-failed-fatal", async () => {
        const sb = getSupabaseAdmin();
        const fatalMsg = lastError ?? "extraction failed";
        await markJobFinal(sb, payload.jobId, "failed", {
          error: fatalMsg,
          errors: [{ scope: "job", error: fatalMsg, kind: "fatal" }],
        });
      });
      return { jobId: payload.jobId, ok: false, error: lastError };
    }

    if (!lastResult) {
      throw new Error(`No result produced for job ${jobId}`);
    }

    const final = lastResult;

    if (final.canceled) {
      await step.run("mark-canceled", async () => {
        const sb = getSupabaseAdmin();
        await markJobFinal(sb, jobId, "canceled", {
          error: final.error ?? "canceled",
          canceled_at: new Date().toISOString(),
        });
      });
      return { jobId, ok: false, canceled: true };
    }

    if (final.status === "blocked") {
      await step.run("mark-blocked", async () => {
        const sb = getSupabaseAdmin();
        await markJobFinal(sb, jobId, "blocked", {
          error: final.error ?? "blocked",
          blocked_at: new Date().toISOString(),
        });
      });
      return { jobId, ok: false, status: "blocked", error: final.error };
    }

    if (final.status === "partial") {
      await step.run("mark-partial", async () => {
        const sb = getSupabaseAdmin();
        await markJobFinal(sb, jobId, "partial", {
          error: final.error ?? null,
          partial_at: new Date().toISOString(),
        });
      });
      return { jobId, ok: true, status: "partial" };
    }

    if (!final.ok && !final.resumable) {
      await step.run("mark-failed", async () => {
        const sb = getSupabaseAdmin();
        const failMsg =
          final.error ??
          (final.libraryPersistedCount === 0
            ? "Nenhuma URL foi persistida na Design Library."
            : "extraction failed");
        await markJobFinal(sb, jobId, "failed", {
          error: failMsg,
        });
      });
      return { jobId, ok: false, status: "failed", error: final.error };
    }

    if (!final.ok && final.resumable) {
      const exhaustedError = final.error ?? "loop budget exhausted";
      await step.run("mark-failed-resumable-exhausted", async () => {
        const sb = getSupabaseAdmin();
        await markJobFinal(sb, jobId, "failed", {
          error: exhaustedError,
          meta: { resumableExhausted: true, resumeAttempts: 3 },
        });
      });
      return { jobId, ok: false, status: "failed", error: exhaustedError };
    }

    await step.run("mark-completed", async () => {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from("design_dna_jobs")
        .select("status, errors")
        .eq("id", jobId)
        .single();
      if (error) {
        throw new Error(`Failed to check job ${jobId} before completion: ${error.message}`);
      }
      if (data?.status === "canceled") return;

      // Gate G2: completed exige pelo menos uma entrada na library
      const persisted = final.libraryPersistedCount ?? 0;
      if (persisted === 0) {
        const g2Error =
          final.error ??
          "Job terminou sem entradas na Design Library — falha de auditoria (G2).";
        const existingErrors = Array.isArray(data?.errors) ? data.errors : [];
        await markJobFinal(sb, jobId, "failed", {
          error: g2Error,
          errors:
            existingErrors.length > 0
              ? existingErrors
              : [{ scope: "job", error: g2Error, kind: "g2_empty_terminal" }],
        });
        return;
      }

      await markJobFinal(sb, jobId, "completed");
    });

    await step.run("drain-queue", async () => {
      const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (!url || !serviceKey) return { continued: false };
      try {
        const resp = await fetch(`${url}/functions/v1/design-dna-scheduler`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ action: "continue_queue" }),
        });
        return await resp.json();
      } catch {
        return { continued: false };
      }
    });

    return {
      jobId,
      ok: true,
      urlsCompleted: final.urlsCompleted,
    };
  },
);
