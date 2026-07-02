import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import {
  appendJobEvent,
  loadJobCheckpoint,
  saveJobCheckpoint,
  type DesignDnaExecuteResponse,
} from "../functions/_shared-design-dna";
import {
  extractDesignDnaForUrl,
  resolveLLMConfig,
  type LLMConfig,
} from "./design-dna-extraction.ts";
import { resolveExtractionCapabilities } from "./resolve-extraction-capabilities.ts";
import { loadUserE2bApiKey } from "../../../supabase/functions/_shared/user-e2b.ts";
import {
  persistLibraryEntry,
  resolveJobTerminalStatus,
} from "./persist-library-entry.ts";
import { connectToSandbox, waitForEnvdReady, runInSandbox } from "./e2b-client";
import { createAgentContext } from "./browser-agent-state";
import { runBrowserAgent, createDefaultCdpTools } from "./browser-agent-runner";
import { runAgentPlanningStep } from "./browser-agent-llm";
import { synthesizeDesignDNA } from "./browser-agent-synthesis";
import type { BrowserAgentContext, BrowserAgentStep } from "./browser-agent-state";

const E2B_API_BASE = process.env.E2B_API_BASE || "https://api.e2b.app";
const E2B_DOMAIN = process.env.E2B_DOMAIN || "e2b.app";
const E2B_TEMPLATE_ID = process.env.E2B_TEMPLATE || "dreaming-doing-chromium";
const LOOP_BUDGET_MS = 270_000;
const PREVIEW_PORT = 9222;

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
          previewUrl: `https://${PREVIEW_PORT}-${latestJob.sandbox_id}.${E2B_DOMAIN}`,
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

  const data = JSON.parse(text) as { sandboxID?: string; sandboxId?: string; templateID?: string };
  const sandboxId = data.sandboxID ?? data.sandboxId ?? "";
  if (!sandboxId) throw new Error("E2B: no sandboxID in response");

  const sandboxTemplate = data.templateID ?? "";
  if (sandboxTemplate && sandboxTemplate !== E2B_TEMPLATE_ID) {
    console.warn(`[design-dna] Sandbox created with template ${sandboxTemplate}, expected ${E2B_TEMPLATE_ID}`);
  }

  await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId, step: "connecting" });

  const { accessToken } = await connectToSandbox(sandboxId, e2bApiKey);

  await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId, step: "waiting-runtime" });

  await waitForEnvdReady(sandboxId, accessToken).catch((err) => {
    console.warn("[design-dna] envd not ready, continuing anyway:", err);
  });

  // Chrome CDP — o template já inicia Chromium via start-chromium.sh na porta 9222.
  // Não tenta iniciar de novo (causaria conflito de porta).
  // Apenas verifica se está respondendo.
  const chromeCheck = `curl -s http://127.0.0.1:9222/json/version && echo "CHROME_READY" || echo "CHROME_NOT_READY"`;
  const chromeResult = await runInSandbox(sandboxId, accessToken, chromeCheck, { timeoutMs: 10_000 });
  if (!chromeResult.stdout?.includes("CHROME_READY")) {
    throw new Error(`Chrome CDP not responding on port 9222 — template start-chromium.sh may have failed. Check E2B template build.`);
  }

  await appendJobEvent(supabase, jobId, "chrome_cdp_ready", { port: 9222 });
  console.log("[design-dna] Chrome CDP ready on port 9222");

  const previewUrl = `https://${PREVIEW_PORT}-${sandboxId}.${E2B_DOMAIN}`;
  await appendJobEvent(supabase, jobId, "sandbox_ready", {
    sandboxId,
    previewUrl,
  });

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
  let libraryPersistedCount = 0;
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
    if (typeof checkpoint.libraryPersistedCount === "number") {
      libraryPersistedCount = checkpoint.libraryPersistedCount;
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Gate G1 (defense in depth): fail closed se pré-requisitos ausentes
  if (userId) {
    const capabilities = await resolveExtractionCapabilities(serviceClient, userId, depth);
    if (!capabilities.ok) {
      const errorRecord = {
        scope: "job",
        error: capabilities.message,
        code: capabilities.code,
        missing: capabilities.missing,
      };
      await appendJobEvent(supabase, jobId, "capability_error", errorRecord);
      await supabase
        .from("design_dna_jobs")
        .update({
          status: "failed",
          error: capabilities.message,
          errors: [errorRecord],
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return {
        ok: false,
        status: "failed",
        jobId,
        resumable: false,
        canceled: false,
        error: capabilities.message,
        urlsCompleted: 0,
        durationMs: Date.now() - startMs,
      };
    }
  }

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
  let sandboxAccessToken: string | null = null;

  if (isDeep) {
    const e2bApiKey = userId ? await loadUserE2bApiKey(serviceClient, userId) : "";
    if (!e2bApiKey) {
      const msg =
        "Sandbox E2B não configurado. Configure em API Models (/api-models) → Tools → E2B.";
      const errorRecord = { scope: "job", error: msg, code: "missing_e2b" };
      errors.push(errorRecord);
      await appendJobEvent(supabase, jobId, "capability_error", errorRecord);
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
    const previewUrl = sb.previewUrl;
    currentMeta.previewUrl = previewUrl;

    currentMeta.progress = 15;

    await supabase
      .from("design_dna_jobs")
      .update({ sandbox_id: sandboxId, meta: currentMeta })
      .eq("id", jobId);
    currentMeta.progress = 20;
    await supabase.from("design_dna_jobs").update({ meta: currentMeta }).eq("id", jobId);
  } else {
    currentMeta.progress = 20;
    await supabase.from("design_dna_jobs").update({ meta: currentMeta }).eq("id", jobId);
  }

  for (let i = startIndex; i < urls.length; i++) {
    const budgetElapsed = Date.now() - startMs;
    if (budgetElapsed > LOOP_BUDGET_MS * 0.8) {
      await saveJobCheckpoint(supabase, jobId, {
        currentUrlIndex: i,
        results,
        errors,
        blockedCount,
        libraryPersistedCount,
      });
      return {
        ok: false,
        status: results.length > 0 ? "completed" : "failed",
        jobId,
        resumable: true,
        canceled: false,
        error: "loop budget exhausted",
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
      });

      let dnaResult;
      if (isDeep) {
        const agentCtx = createAgentContext({
          jobId,
          url,
          categories: categories as string[],
          depth: "deep",
          userId,
          sandboxId,
          sandboxAccessToken,
          maxSteps: 25,
        });

        const resolvedLlm = await resolveLLMConfig(serviceClient, userId, "high");
        if (!resolvedLlm) {
          throw new Error("No LLM configured for DEEP browser agent");
        }
        const llm: LLMConfig = {
          apiKey: resolvedLlm.apiKey,
          baseUrl: resolvedLlm.baseUrl,
          model: resolvedLlm.model,
          label: resolvedLlm.label,
          protocol: resolvedLlm.protocol,
        };

        const tools = createDefaultCdpTools();

        const planner = async (ctx: BrowserAgentContext, screenshotBase64?: string) => {
          const callLlm = async (messages: Array<{ role: string; content: string }>) => {
            const res = await fetch(`${llm.baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${llm.apiKey}`,
              },
              body: JSON.stringify({
                model: llm.model,
                messages,
                max_tokens: 2048,
                temperature: 0.3,
                response_format: { type: "json_object" },
              }),
              signal: AbortSignal.timeout(120000),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              throw new Error(`Agent planner LLM error: ${res.status} ${text.slice(0, 200)}`);
            }
            const data = await res.json();
            return { content: data.choices?.[0]?.message?.content ?? "" };
          };
          return runAgentPlanningStep(ctx, callLlm, screenshotBase64);
        };

        const synthesizer = async (steps: BrowserAgentStep[], u: string, cats: string[]) => {
          const callLlm = async (messages: Array<{ role: string; content: string }>) => {
            const res = await fetch(`${llm.baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${llm.apiKey}`,
              },
              body: JSON.stringify({
                model: llm.model,
                messages,
                max_tokens: 4096,
                temperature: 0.3,
                response_format: { type: "json_object" },
              }),
              signal: AbortSignal.timeout(120000),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => "");
              throw new Error(`Agent synthesis LLM error: ${res.status} ${text.slice(0, 200)}`);
            }
            const data = await res.json();
            return { content: data.choices?.[0]?.message?.content ?? "" };
          };
          return synthesizeDesignDNA(steps, u, cats, callLlm);
        };

        const fetchInstructions = async (id: string) => {
          const { data } = await serviceClient
            .from("design_dna_instructions")
            .select("id, role, content, status, created_at")
            .eq("job_id", id)
            .eq("status", "pending")
            .order("created_at", { ascending: true });
          return (data ?? []).map((row: Record<string, unknown>) => ({
            id: row.id as string,
            role: row.role as "user" | "system",
            content: row.content as string,
            status: row.status as "pending" | "consumed" | "canceled",
            createdAt: row.created_at as string,
          }));
        };

        const markConsumed = async (id: string) => {
          await serviceClient
            .from("design_dna_instructions")
            .update({ status: "consumed", consumed_at: new Date().toISOString() })
            .eq("job_id", id)
            .eq("status", "pending");
        };

        const agentResult = await runBrowserAgent(
          agentCtx,
          supabase,
          tools,
          planner,
          synthesizer,
          fetchInstructions,
          markConsumed,
        );

        if (!agentResult.ok) {
          throw new Error(agentResult.error);
        }

        const dna = agentResult.dna;
        dnaResult = {
          dna,
          rawMarkdown: `Agent steps: ${agentResult.steps.length}`,
          cleanMarkdown: "",
          rawHtml: "",
          cleanHtml: "",
          contentHygiene: {
            title: dna.name,
            rootSelector: "",
            rawMarkdownChars: 0,
            cleanMarkdownChars: 0,
            rawHtmlChars: 0,
            cleanHtmlChars: 0,
          },
          screenshotUrl: "",
          screenshotBase64: agentResult.steps.find((s) => s.observation.screenshot)?.observation.screenshot,
          screenshots: agentResult.steps
            .filter((s) => s.observation.screenshot)
            .map((s) => s.observation.screenshot as string),
          providerTrace: [`llm:${llm.label}`, "cdp:browser-agent"],
          confidence: 90,
          notes: [`Browser agent completed ${agentResult.steps.length} steps`, ...agentResult.steps.map((s) => `${s.action.type}: ${s.thought}`)],
          blockedReason: null,
        };
      } else {
        dnaResult = await extractDesignDnaForUrl(serviceClient, {
          url,
          depth,
          categories: categories as string[],
          userId,
        });
      }

      const persistResult = await persistLibraryEntry(
        supabase,
        jobId,
        {
          url,
          urlIndex: i,
          depth,
          ingestKind,
          userId,
          categories: categories as string[],
        },
        dnaResult,
      );

      let urlPersisted = false;
      if (persistResult.ok) {
        results.push(persistResult.dna);
        libraryPersistedCount += 1;
        urlPersisted = true;
      } else {
        if (persistResult.code === "blocked") {
          blockedCount += 1;
        }
        errors.push({
          url,
          index: i,
          error: persistResult.message,
          kind: persistResult.code,
          ...(persistResult.details ?? {}),
        });
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
      currentMeta.progress = Math.min(85, 25 + Math.round(((i + 1) / urls.length) * 60));
      await supabase
        .from("design_dna_jobs")
        .update({ status: "running", meta: currentMeta })
        .eq("id", jobId);

      await appendJobEvent(supabase, jobId, "url_extracted", {
        url,
        ok: urlPersisted,
        index: i,
        resultsCount: results.length,
        libraryPersistedCount,
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

  const terminal = resolveJobTerminalStatus({
    urlsTotal: urls.length,
    libraryPersistedCount,
    errors,
    blockedCount,
  });

  currentMeta.current_url_index = urls.length;
  currentMeta.urls_completed = results.length;
  currentMeta.library_persisted_count = libraryPersistedCount;
  currentMeta.blocked_urls = blockedCount;
  currentMeta.progress = 100;

  await appendJobEvent(supabase, jobId, "job_terminal", {
    status: terminal.status,
    libraryPersistedCount,
    errorsCount: errors.length,
    blockedCount,
    jobError: terminal.jobError ?? null,
  });

  await supabase
    .from("design_dna_jobs")
    .update({
      results,
      errors,
      meta: currentMeta,
      error: terminal.jobError ?? null,
    })
    .eq("id", jobId);

  return {
    ok: terminal.ok,
    status: terminal.status,
    jobId,
    resumable: false,
    canceled: false,
    error: terminal.jobError,
    urlsCompleted: libraryPersistedCount,
    libraryPersistedCount,
    durationMs: Date.now() - startMs,
  };
}
