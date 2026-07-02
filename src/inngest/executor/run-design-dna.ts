import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import {
  appendJobEvent,
  loadJobCheckpoint,
  saveJobCheckpoint,
  type DesignDnaExecuteResponse,
} from "../functions/_shared-design-dna";
import {
  assertLlmMatchesG1,
  createLlmChatDispatcher,
  extractDesignDnaForUrl,
  resolveLlmConfigForG1Model,
  type LLMConfig,
} from "./design-dna-extraction.ts";
import { ensurePreview } from "./design-dna-preview.ts";
import {
  resolveExtractionCapabilities,
  type ExtractionCapabilitiesOk,
} from "./resolve-extraction-capabilities.ts";
import { loadUserE2bApiKey } from "../../../supabase/functions/_shared/user-e2b.ts";
import {
  persistLibraryEntry,
  resolveJobTerminalStatus,
} from "./persist-library-entry.ts";
import { ensureDesignDnaSandbox } from "./design-dna-sandbox.ts";
import { createAgentContext } from "./browser-agent-state";
import { runBrowserAgent, createDefaultCdpTools } from "./browser-agent-runner";
import { runAgentPlanningStep } from "./browser-agent-llm";
import { synthesizeDesignDNA } from "./browser-agent-synthesis";
import type { BrowserAgentContext, BrowserAgentStep } from "./browser-agent-state";
import {
  COOPERATIVE_WALL_MS,
  operationWallExceeded,
  parseRunOperationMeta,
  remainingOperationMs,
  type RunOperationMeta,
} from "@/lib/agent-operation-contract";

const OPERATION_RESUME_BUFFER_MS = 120_000;

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

  let capabilitiesOk: ExtractionCapabilitiesOk | null = null;

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
    capabilitiesOk = capabilities;
  }

  const { data: job } = await supabase
    .from("design_dna_jobs")
    .select("sandbox_id, meta")
    .eq("id", jobId)
    .single();

  const currentMeta = { ...((job?.meta ?? {}) as Record<string, unknown>) };
  const ingestKind =
    typeof currentMeta.ingestKind === "string" && currentMeta.ingestKind.trim()
      ? currentMeta.ingestKind.trim()
      : "production";
  currentMeta.ingestKind = ingestKind;
  const operationMeta: RunOperationMeta =
    parseRunOperationMeta(currentMeta.operation) ?? {
      mode: "cooperative",
      startedAt: new Date(startMs).toISOString(),
      wallMs: COOPERATIVE_WALL_MS,
      reportOnExit: false,
    };
  const isDeep = depth === "deep";
  let sandboxId = "";
  let sandboxAccessToken: string | null = null;
  let deepLlm: LLMConfig | null = null;

  if (isDeep) {
    if (!capabilitiesOk?.llm.supportsVision) {
      const msg =
        "Modelo sem visão para DEEP. Configure um modelo vision em API Models (/api-models).";
      const errorRecord = { scope: "job", error: msg, code: "missing_vision" };
      errors.push(errorRecord);
      await appendJobEvent(supabase, jobId, "capability_error", errorRecord);
      await supabase
        .from("design_dna_jobs")
        .update({
          status: "failed",
          error: msg,
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

    const resolvedWire = await resolveLlmConfigForG1Model(
      serviceClient,
      userId,
      capabilitiesOk.llm,
    );
    if (!resolvedWire) {
      const msg =
        `Conector LLM "${capabilitiesOk.llm.connectorEnv}" indisponível para o modelo ${capabilitiesOk.llm.model}. ` +
        "Verifique API Models (/api-models).";
      const errorRecord = { scope: "job", error: msg, code: "missing_llm" };
      errors.push(errorRecord);
      await appendJobEvent(supabase, jobId, "capability_error", errorRecord);
      await supabase
        .from("design_dna_jobs")
        .update({
          status: "failed",
          error: msg,
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
    assertLlmMatchesG1(resolvedWire, capabilitiesOk.llm);
    deepLlm = {
      apiKey: resolvedWire.apiKey,
      baseUrl: resolvedWire.baseUrl,
      model: resolvedWire.model,
      label: resolvedWire.label,
      protocol: resolvedWire.protocol,
    };

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

    const sb = await ensureDesignDnaSandbox(
      supabase,
      userId,
      e2bApiKey,
      jobId,
      job?.sandbox_id,
      { wallMs: operationMeta.wallMs },
    );
    sandboxId = sb.sandboxId;
    sandboxAccessToken = sb.accessToken;

    const preview = await ensurePreview(supabase, jobId, sandboxId, sandboxAccessToken);
    currentMeta.previewUrl = preview.previewUrl;
    currentMeta.sandboxReused = sb.reused;

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
    if (operationWallExceeded(operationMeta)) {
      const errorRecord = {
        scope: "job",
        error: "Operation wall exceeded",
        code: "operation_wall",
      };
      errors.push(errorRecord);
      await appendJobEvent(supabase, jobId, "capability_error", errorRecord);
      await saveJobCheckpoint(supabase, jobId, {
        currentUrlIndex: i,
        results,
        errors,
        blockedCount,
        libraryPersistedCount,
      });
      return {
        ok: false,
        status: "failed",
        jobId,
        resumable: false,
        canceled: false,
        error: "Operation wall exceeded",
        urlsCompleted: results.length,
        durationMs: Date.now() - startMs,
      };
    }

    if (remainingOperationMs(operationMeta) < OPERATION_RESUME_BUFFER_MS) {
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
        error: "operation wall nearly exhausted — resume to continue",
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
        if (!deepLlm) {
          throw new Error("DEEP LLM not resolved — internal error");
        }
        const llm = deepLlm;

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

        const tools = createDefaultCdpTools();
        const visionLlm = createLlmChatDispatcher(llm);

        const planner = async (ctx: BrowserAgentContext, screenshotBase64?: string) =>
          runAgentPlanningStep(ctx, visionLlm, screenshotBase64);

        const synthesizer = async (steps: BrowserAgentStep[], u: string, cats: string[]) =>
          synthesizeDesignDNA(steps, u, cats, visionLlm);

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
          screenshotBase64: agentResult.steps.find((s) => s.observation.screenshot)
            ?.observation.screenshot,
          screenshots: agentResult.steps
            .filter((s) => s.observation.screenshot)
            .map((s) => s.observation.screenshot as string),
          providerTrace: [`llm:${llm.label}`, "cdp:sandbox-playwright"],
          confidence: 90,
          notes: [
            `Browser agent completed ${agentResult.steps.length} steps`,
            ...agentResult.steps.map((s) => `${s.action.type}: ${s.thought}`),
          ],
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