/**
 * Design DNA DEEP sandbox — isolado por job (G4.1 fix).
 *
 * Nunca reutiliza sandbox de outro job/usuário — só o sandbox_id do job atual (resume).
 */
import { appendJobEvent } from "../functions/_shared-design-dna";
import type { SupabaseClient } from "@supabase/supabase-js";
import { connectToSandbox, waitForEnvdReady } from "./e2b-client";

const E2B_API_BASE = process.env.E2B_API_BASE || "https://api.e2b.app";
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE || "dreaming-doing-chromium";

export type SandboxConnectResult = {
  sandboxId: string;
  accessToken: string | null;
  reused: boolean;
};

/**
 * Resolve sandbox_id reutilizável — apenas o do job atual (resume DEEP).
 * Retorna null se deve criar sandbox novo.
 */
export function resolveJobScopedSandboxId(
  jobId: string,
  existingSandboxId: string | null | undefined,
): string | null {
  const id = typeof existingSandboxId === "string" ? existingSandboxId.trim() : "";
  if (!id) return null;
  return id;
}

/** E2B sandbox lifetime — aligned to operation wall (cooperative 60min / HOTL). */
export function e2bSandboxTimeoutSeconds(wallMs: number): number {
  const sec = Math.floor(wallMs / 1000);
  return Math.min(Math.max(sec, 3600), 7200);
}

export async function ensureDesignDnaSandbox(
  supabase: SupabaseClient,
  userId: string,
  e2bApiKey: string,
  jobId: string,
  existingSandboxId?: string | null,
  options?: { wallMs?: number },
): Promise<SandboxConnectResult> {
  const sandboxTimeout = e2bSandboxTimeoutSeconds(options?.wallMs ?? 60 * 60 * 1000);
  const scopedId = resolveJobScopedSandboxId(jobId, existingSandboxId);

  if (scopedId) {
    try {
      const { accessToken } = await connectToSandbox(scopedId, e2bApiKey);
      if (accessToken) {
        await appendJobEvent(supabase, jobId, "sandbox_setup", {
          sandboxId: scopedId,
          step: "reusing-job-sandbox",
        });
        return { sandboxId: scopedId, accessToken, reused: true };
      }
    } catch {
      /* sandbox morto — cria novo abaixo */
    }
  }

  await appendJobEvent(supabase, jobId, "sandbox_setup", {
    sandboxId: "pending",
    step: "creating",
  });

  const resp = await fetch(`${E2B_API_BASE}/sandboxes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": e2bApiKey },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      templateID: E2B_TEMPLATE_ID,
      timeout: sandboxTimeout,
      autoPause: true,
      autoPauseMemory: true,
      autoResume: { enabled: true },
      metadata: {
        forge_app: "dreaming-doing",
        forge_job_id: jobId,
        forge_user_id: userId,
      },
    }),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`E2B create ${resp.status}: ${text.slice(0, 400)}`);

  const data = JSON.parse(text) as {
    sandboxID?: string;
    sandboxId?: string;
    templateID?: string;
  };
  const sandboxId = data.sandboxID ?? data.sandboxId ?? "";
  if (!sandboxId) throw new Error("E2B: no sandboxID in response");

  const sandboxTemplate = data.templateID ?? "";
  if (sandboxTemplate && sandboxTemplate !== E2B_TEMPLATE_ID) {
    console.warn(
      `[design-dna] Sandbox created with template ${sandboxTemplate}, expected ${E2B_TEMPLATE_ID}`,
    );
  }

  await appendJobEvent(supabase, jobId, "sandbox_setup", {
    sandboxId,
    step: "connecting",
  });

  const { accessToken } = await connectToSandbox(sandboxId, e2bApiKey);

  await appendJobEvent(supabase, jobId, "sandbox_setup", {
    sandboxId,
    step: "waiting-runtime",
  });

  await waitForEnvdReady(sandboxId, accessToken).catch((err) => {
    console.warn("[design-dna] envd not ready, continuing anyway:", err);
  });

  return { sandboxId, accessToken, reused: false };
}