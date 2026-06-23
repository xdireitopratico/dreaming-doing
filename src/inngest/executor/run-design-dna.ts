import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  appendJobEvent,
  loadJobCheckpoint,
  saveJobCheckpoint,
  type DesignDnaExecuteResponse,
} from "../functions/_shared-design-dna";
import { extractDesignDnaForUrl } from "./design-dna-extraction.ts";

const E2B_API_BASE = process.env.E2B_API_BASE || "https://api.e2b.app";
const E2B_DOMAIN = process.env.E2B_DOMAIN || "e2b.app";
// Template custom: vem com Chromium + Playwright + Chrome DevTools em 9222
// Para buildar: cd e2b-template && npm run build:prod
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE || "dreaming-doing-chromium";
const LOOP_BUDGET_MS = 270_000;
const CHROMIUM_DEBUG_PORT = 9222;

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
  if (resume && checkpoint) {
    startIndex = (checkpoint.currentUrlIndex as number) ?? 0;
    if (Array.isArray(checkpoint.results)) {
      results.push(...(checkpoint.results as Record<string, unknown>[]));
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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
    await appendJobEvent(supabase, jobId, "url_error", { error: msg });
    await supabase
      .from("design_dna_jobs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", jobId);
    return {
      ok: false,
      jobId,
      resumable: false,
      canceled: false,
      error: msg,
      urlsCompleted: 0,
      durationMs: Date.now() - startMs,
    };
  }

  let sandboxId = "";
  let previewUrl = "";

  const { data: job } = await supabase
    .from("design_dna_jobs")
    .select("sandbox_id, meta")
    .eq("id", jobId)
    .single();

  const jobMeta = (job?.meta ?? {}) as Record<string, unknown>;
  const ingestKind = typeof jobMeta.ingestKind === "string" && jobMeta.ingestKind.trim()
    ? jobMeta.ingestKind.trim()
    : "production";

  if (job?.sandbox_id) {
    sandboxId = job.sandbox_id as string;
    const meta = (job.meta ?? {}) as Record<string, unknown>;
    previewUrl =
      (meta.previewUrl as string) ?? `https://${CHROMIUM_DEBUG_PORT}-${sandboxId}.${E2B_DOMAIN}`;
  } else {
    const resp = await fetch(`${E2B_API_BASE}/sandboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": e2bApiKey },
      body: JSON.stringify({
        templateID: E2B_TEMPLATE_ID,
        timeout: 3600,
        metadata: { forge_app: "dreaming-doing", forge_job_id: jobId, forge_user_id: userId },
      }),
    });

    const text = await resp.text();
    if (!resp.ok) throw new Error(`E2B create ${resp.status}: ${text.slice(0, 400)}`);

    const data = JSON.parse(text) as { sandboxID?: string; sandboxId?: string };
    sandboxId = data.sandboxID ?? data.sandboxId ?? "";
    if (!sandboxId) throw new Error("E2B: no sandboxID in response");

    previewUrl = `https://${CHROMIUM_DEBUG_PORT}-${sandboxId}.${E2B_DOMAIN}`;

    const connectResp = await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": e2bApiKey },
      body: JSON.stringify({ timeout: 3600 }),
    });
    if (!connectResp.ok) {
      const raw = await connectResp.text().catch(() => "unknown");
      console.warn("[design-dna] sandbox connect warning:", raw);
    }

    await supabase
      .from("design_dna_jobs")
      .update({ sandbox_id: sandboxId, meta: { previewUrl } })
      .eq("id", jobId);
  }

  const sandboxExecUrl = `${supabaseUrl}/functions/v1/prometheus-tool-executor`;

  // Verifica que Chromium está acessível via DevTools na porta 9222
  // (template custom já tem Chromium rodando, então só pingamos o endpoint JSON)
  if (startIndex === 0) {
    await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId });
    try {
      const devtoolsVersionUrl = `${previewUrl}/json/version`;
      const cdpResp = await fetch(devtoolsVersionUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (cdpResp.ok) {
        const cdpData = await cdpResp.json().catch(() => ({}));
        console.log("[design-dna] CDP ready:", JSON.stringify(cdpData).slice(0, 200));
        await appendJobEvent(supabase, jobId, "sandbox_ready", {
          sandboxId,
          previewUrl,
          chromium: cdpData.Browser ?? "ready",
        });
      } else {
        console.warn(
          `[design-dna] CDP not reachable at ${devtoolsVersionUrl}: HTTP ${cdpResp.status}`,
        );
        await appendJobEvent(supabase, jobId, "sandbox_ready", {
          sandboxId,
          previewUrl,
          chromium: `CDP HTTP ${cdpResp.status} — preview iframe pode não funcionar`,
        });
      }
    } catch (cdpErr) {
      console.warn("[design-dna] CDP check failed:", cdpErr);
      await appendJobEvent(supabase, jobId, "sandbox_ready", {
        sandboxId,
        previewUrl,
        chromium: `CDP unreachable: ${cdpErr instanceof Error ? cdpErr.message : "unknown"}`,
      });
    }
  }

  for (let i = startIndex; i < urls.length; i++) {
    const budgetElapsed = Date.now() - startMs;
    if (budgetElapsed > LOOP_BUDGET_MS * 0.8) {
      await saveJobCheckpoint(supabase, jobId, { currentUrlIndex: i, results });
      return {
        ok: false,
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
        sandboxExecUrl,
        sandboxToken: serviceRoleKey,
      });

      if (dnaResult.dna) {
        const dna = dnaResult.dna as Record<string, unknown>;
        results.push(dna);

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
          raw_html: dnaResult.rawHtml,
          clean_html: dnaResult.cleanHtml,
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

      await supabase
        .from("design_dna_jobs")
        .update({
          status: "running",
          meta: { current_url_index: i + 1, urls_completed: results.length, previewUrl },
        })
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
      const msg = err instanceof Error ? err.message : String(err);
      await appendJobEvent(supabase, jobId, "url_error", { url, error: msg, index: i });
    }
  }

  return {
    ok: true,
    jobId,
    resumable: false,
    canceled: false,
    urlsCompleted: results.length,
    durationMs: Date.now() - startMs,
  };
}
