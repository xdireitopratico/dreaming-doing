import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import {
  appendJobEvent,
  loadJobCheckpoint,
  saveJobCheckpoint,
  type DesignDnaExecuteResponse,
} from "../functions/_shared-design-dna";
import { extractDesignDnaForUrl } from "./design-dna-extraction.ts";
import { connectToSandbox, waitForEnvdReady, runInSandbox } from "./e2b-client";

const E2B_API_BASE = process.env.E2B_API_BASE || "https://api.e2b.app";
const E2B_DOMAIN = process.env.E2B_DOMAIN || "e2b.app";
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE || "code-interpreter-v1";
const LOOP_BUDGET_MS = 270_000;
const CHROMIUM_DEBUG_PORT = 9222;

async function ensureDesignDnaSandbox(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  userId: string,
  e2bApiKey: string,
  jobId: string,
): Promise<{ sandboxId: string; accessToken: string | null; previewUrl: string }> {
  // Tenta reusar sandbox existente de jobs anteriores
  const { data: latestJob } = await serviceClient
    .from("design_dna_jobs")
    .select("sandbox_id")
    .not("sandbox_id", "is", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestJob?.sandbox_id) {
    try {
      const { accessToken } = await connectToSandbox(latestJob.sandbox_id as string, e2bApiKey);
      if (accessToken) {
        return {
          sandboxId: latestJob.sandbox_id as string,
          accessToken,
          previewUrl: `https://${CHROMIUM_DEBUG_PORT}-${latestJob.sandbox_id}.${E2B_DOMAIN}`,
        };
      }
    } catch {
      // 404 ou erro — sandbox morto, cria novo abaixo
    }
  }

  // Cria novo sandbox com auto-pause de 15 min
  await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId: "pending", step: "creating" });

  const resp = await fetch(`${E2B_API_BASE}/sandboxes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": e2bApiKey },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      templateID: E2B_TEMPLATE_ID,
      timeout: 900,
      autoPause: true,
      autoPauseMemory: true,
      autoResume: { enabled: true },
      metadata: { forge_app: "dreaming-doing", forge_job_id: jobId, forge_user_id: userId },
    }),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`E2B create ${resp.status}: ${text.slice(0, 400)}`);

  const data = JSON.parse(text) as { sandboxID?: string; sandboxId?: string };
  const sandboxId = data.sandboxID ?? data.sandboxId ?? "";
  if (!sandboxId) throw new Error("E2B: no sandboxID in response");

  const previewUrl = `https://${CHROMIUM_DEBUG_PORT}-${sandboxId}.${E2B_DOMAIN}`;

  await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId, step: "connecting" });

  const { accessToken } = await connectToSandbox(sandboxId, e2bApiKey);

  await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId, step: "waiting-runtime" });

  await waitForEnvdReady(sandboxId, accessToken).catch((err) => {
    console.warn("[design-dna] envd not ready, continuing anyway:", err);
  });

  // Instala Playwright + Chromium (uma vez, persiste no pause/resume)
  await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId, step: "installing-playwright" });
  try {
    const installResult = await runInSandbox(
      sandboxId,
      accessToken,
      "cd /tmp && npm install playwright@latest --no-audit --no-fund 2>&1 && npx playwright install chromium 2>&1",
      { timeoutMs: 180000 },
    );
    if (installResult.exitCode === 0) {
      console.log("[design-dna] Playwright+Chromium installed in sandbox");
      await appendJobEvent(supabase, jobId, "sandbox_ready", {
        sandboxId,
        previewUrl,
      });
    } else {
      const errMsg = `Playwright install exited with code ${installResult.exitCode}: ${(installResult.stderr ?? "").slice(0, 400)}`;
      await appendJobEvent(supabase, jobId, "url_error", {
        scope: "sandbox",
        error: errMsg,
      });
      throw new Error(errMsg);
    }
  } catch (pwErr) {
    await appendJobEvent(supabase, jobId, "url_error", {
      scope: "sandbox",
      error: `Playwright install failed: ${errorMessage(pwErr)}`,
    });
    throw new Error(`Playwright/Chromium install failed: ${errorMessage(pwErr)}`);
  }

  return { sandboxId, accessToken, previewUrl };
}

export async function executeDesignDnaJob(
  supabase: SupabaseClient,
  payload: {
    jobId: string;
    userId: string;
    depth: "shallow" | "deep";
    categories: string[];
    urls: string[];
    resume?: boolean;
  },
): Promise<DesignDnaExecuteResponse> {
  const startMs = Date.now();
  const { jobId, userId, depth, categories, urls, resume } = payload;

  const checkpoint = resume ? await loadJobCheckpoint(supabase, jobId) : null;

  let startIndex = 0;
  const results: Record<string, unknown>[] = [];
  const errors: Record<string, unknown>[] = [];
  let blockedCount = 0;
  if (resume && checkpoint) {
    startIndex = (checkpoint.currentUrlIndex as number) ?? 0;
    if (Array.isArray(checkpoint.results)) {
      results.push(...(checkpoint.results as Record<string, unknown>[]));
    }
    if (Array.isArray(checkpoint.errors)) {
      errors.push(...(checkpoint.errors as Record<string, unknown>[]));
    }
    if (typeof checkpoint.blockedCount === "number") {
      blockedCount = checkpoint.blockedCount;
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: job } = await supabase
      .from("design_dna_jobs")
      .select("sandbox_id, meta")
      .eq("id", jobId)
      .single();

  const currentMeta = { ...((job?.meta ?? {}) as Record<string, unknown>) };
  const ingestKind = typeof currentMeta.ingestKind === "string" && currentMeta.ingestKind.trim()
    ? currentMeta.ingestKind.trim()
    : "production";
  currentMeta.ingestKind = ingestKind;
  const isDeep = depth === "deep";
  let sandboxId = "";
  let previewUrl = "";
  let sandboxAccessToken: string | null = null;

  if (isDeep) {
    const { data: connectors } = await serviceClient
      .from("connectors")
      .select("token_encrypted")
      .eq("owner_id", userId)
      .eq("kind", "e2b")
      .order("updated_at", { ascending: false })
      .limit(5);

    let e2bApiKey = "";
    for (const row of connectors ?? []) {
      const raw = (row.token_encrypted as string) ?? "";
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("[")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            const first = parsed.find(
              (x: unknown) => typeof x === "string" && (x as string).trim().length > 8,
            );
            if (first) {
              e2bApiKey = (first as string).trim();
              break;
            }
          }
        } catch {
          /* single token */
        }
      }
      if (trimmed.length > 8) {
        e2bApiKey = trimmed;
        break;
      }
    }

    if (!e2bApiKey) {
      const msg = "Configure sua chave E2B em API Keys (/api)";
      const errorRecord = { scope: "job", error: msg, code: "missing_e2b_key" };
      errors.push(errorRecord);
      await appendJobEvent(supabase, jobId, "url_error", errorRecord);
      await supabase
        .from("design_dna_jobs")
        .update({
          status: "failed",
          error: msg,
          results,
          errors,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return {
        ok: false,
        status: "failed",
        jobId,
        resumable: false,
        canceled: false,
        error: msg,
        urlsCompleted: 0,
        durationMs: Date.now() - startMs,
      };
    }

    // Sandbox persistente com auto-pause/resume — E2B gerencia idle de 15 min
    const sb = await ensureDesignDnaSandbox(supabase, serviceClient, userId, e2bApiKey, jobId);
    sandboxId = sb.sandboxId;
    sandboxAccessToken = sb.accessToken;
    previewUrl = sb.previewUrl;

    currentMeta.previewUrl = previewUrl;
    currentMeta.progress = 15;

    await supabase
      .from("design_dna_jobs")
      .update({ sandbox_id: sandboxId, meta: currentMeta })
      .eq("id", jobId);

    // Verifica CDP opcional — se falhar, não bloqueia (Chrome só é lançado por URL)
    if (startIndex === 0) {
      await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId });
      try {
        const devtoolsVersionUrl = `${previewUrl}/json/version`;
        const cdpResp = await fetch(devtoolsVersionUrl, { signal: AbortSignal.timeout(5_000) });
        if (cdpResp.ok) {
          const cdpData = await cdpResp.json().catch(() => ({}));
          console.log("[design-dna] CDP ready:", JSON.stringify(cdpData).slice(0, 200));
        } else {
          console.warn(`[design-dna] CDP not reachable (HTTP ${cdpResp.status}) — Chrome starts per-URL, not persistent`);
        }
      } catch {
        console.warn("[design-dna] CDP unreachable — Chrome starts per-URL via Playwright script");
      }
    }
    currentMeta.progress = 20;
    await supabase.from("design_dna_jobs").update({ meta: currentMeta }).eq("id", jobId);
  } else {
    currentMeta.progress = 20;
    await supabase.from("design_dna_jobs").update({ meta: currentMeta }).eq("id", jobId);
  }

  for (let i = startIndex; i < urls.length; i++) {
    const budgetElapsed = Date.now() - startMs;
    if (budgetElapsed > LOOP_BUDGET_MS * 0.8) {
      await saveJobCheckpoint(supabase, jobId, { currentUrlIndex: i, results, errors, blockedCount });
      return {
        ok: false,
        status: results.length > 0 || blockedCount > 0 || errors.length > 0 ? "partial" : "blocked",
        jobId,
        resumable: true,
        canceled: false,
        error: "loop budget",
        urlsCompleted: results.length,
        durationMs: Date.now() - startMs,
      };
    }

    const url = urls[i];
    try {
      await appendJobEvent(supabase, jobId, "url_extracting", {
        url,
        index: i,
        total: urls.length,
        sandboxId,
        previewUrl,
      });

      const dnaResult = await extractDesignDnaForUrl(serviceClient, {
        url,
        depth,
        categories: categories as string[],
        userId,
        sandboxId: isDeep ? sandboxId : undefined,
        sandboxAccessToken: isDeep ? (sandboxAccessToken ?? undefined) : undefined,
      });

      if (dnaResult.dna) {
        const dna = dnaResult.dna as Record<string, unknown>;
        results.push(dna);
        if (dnaResult.blockedReason) blockedCount += 1;

        const { error: insertError } = await supabase.from("design_system_library").upsert({
          name: (dna.name as string) || url,
          source_url: url,
          ingest_kind: ingestKind,
          category: (dna.category as string) || "full_page",
          extracted_by: userId,
          quality_score: Math.max(0, Math.min(10, Number(dna.quality_score ?? (depth === "deep" ? 7 : 5)))),
          quality_source: (dna.quality_source as string) || (depth === "deep" ? "deep_extraction" : "shallow_extraction"),
          validated: false,
          raw_markdown: dnaResult.rawMarkdown,
          clean_markdown: dnaResult.cleanMarkdown,
          raw_html: dnaResult.rawHtml,
          clean_html: dnaResult.cleanHtml,
          content_hygiene: dnaResult.contentHygiene,
          screenshot_url: dnaResult.screenshotUrl,
          screenshot_base64: dnaResult.screenshotBase64 ?? null,
          provider_trace: dnaResult.providerTrace,
          confidence: dnaResult.confidence,
          blocked_reason: dnaResult.blockedReason,
          design_dna: {
            layout: dna.layout ?? null,
            color: dna.color ?? null,
            typography: dna.typography ?? null,
            motion: dna.motion ?? null,
            interaction: dna.interaction ?? null,
            component: dna.component ?? null,
            implementation_notes: dna.implementation_notes ?? null,
          },
          serves_domains: (dna.serves_domains as string[]) || [],
          compatible_languages: (dna.compatible_languages as string[]) || [],
          compatible_moods: (dna.compatible_moods as string[]) || [],
          tags: [categories.join(",")],
          notes: dnaResult.notes.join(" | ") || null,
        }, { onConflict: "source_url,ingest_kind" });
        if (insertError) {
          errors.push({ url, index: i, error: insertError.message, kind: "library_upsert" });
          console.warn(`[design-dna] Failed to persist library entry for ${url}: ${insertError.message}`);
        }
      }

      // Emite screenshots como eventos separados (para timeline real-time)
      if (dnaResult.screenshots.length > 0) {
        const maxShots = Math.min(dnaResult.screenshots.length, 5);
        for (let si = 0; si < maxShots; si++) {
          await appendJobEvent(supabase, jobId, "screenshot_taken", {
            url,
            index: si,
            total: maxShots,
            screenshot: dnaResult.screenshots[si].slice(0, 5000),
          });
        }
      }

      currentMeta.current_url_index = i + 1;
      currentMeta.urls_completed = results.length;
      currentMeta.previewUrl = previewUrl;
      currentMeta.progress = Math.min(85, 25 + Math.round(((i + 1) / urls.length) * 60));
      await supabase
        .from("design_dna_jobs")
        .update({ status: "running", meta: currentMeta })
        .eq("id", jobId);

      await appendJobEvent(supabase, jobId, "url_extracted", {
        url,
        ok: true,
        index: i,
        resultsCount: results.length,
        confidence: dnaResult.confidence,
        providerTrace: dnaResult.providerTrace,
      });

      if (dnaResult.notes.length > 0) {
        await appendJobEvent(supabase, jobId, "url_note", {
          url,
          index: i,
          notes: dnaResult.notes.slice(0, 10),
        });
      }
    } catch (err) {
      const msg = errorMessage(err);
      const errorRecord = { url, error: msg, index: i };
      errors.push(errorRecord);
      await appendJobEvent(supabase, jobId, "url_error", errorRecord);
    }
  }

  const completedCount = results.length;
  const status = blockedCount > 0 && blockedCount >= urls.length
    ? "blocked"
    : completedCount === 0 && errors.length > 0
      ? "failed"
      : errors.length > 0 || blockedCount > 0
        ? "partial"
        : "completed";

  currentMeta.previewUrl = previewUrl;
  currentMeta.current_url_index = urls.length;
  currentMeta.urls_completed = completedCount;
  currentMeta.blocked_urls = blockedCount;
  currentMeta.progress = 100;
  await supabase
    .from("design_dna_jobs")
    .update({ results, errors, meta: currentMeta })
    .eq("id", jobId);

  return {
    ok: status === "completed",
    status,
    jobId,
    resumable: false,
    canceled: false,
    urlsCompleted: completedCount,
    durationMs: Date.now() - startMs,
  };
}
