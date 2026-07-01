import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { errorMessage } from "@/lib/error-utils";
import {
  appendJobEvent,
  loadJobCheckpoint,
  saveJobCheckpoint,
  type DesignDnaExecuteResponse,
} from "../functions/_shared-design-dna";
import { extractDesignDnaForUrl, ensurePythonAgentInSandbox, type LLMConfig } from "./design-dna-extraction.ts";
import { connectToSandbox, waitForEnvdReady, runInSandbox } from "./e2b-client";
import { createAgentContext } from "./browser-agent-state";
import { runBrowserAgent, createDefaultCdpTools } from "./browser-agent-runner";
import { runAgentPlanningStep } from "./browser-agent-llm";
import { synthesizeDesignDNA } from "./browser-agent-synthesis";
import type { BrowserAgentContext, BrowserAgentStep } from "./browser-agent-state";
import { resolveLLMConfig } from "./design-dna-extraction.ts";

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

  // Upload do agente Python (uma vez, persiste no pause/resume)
  await appendJobEvent(supabase, jobId, "sandbox_setup", { sandboxId, step: "uploading-python-agent" });
  try {
    await ensurePythonAgentInSandbox(sandboxId, accessToken);
    console.log("[design-dna] Python agent uploaded to sandbox");
  } catch (agentErr) {
    const msg = `Python agent upload failed: ${errorMessage(agentErr)}`;
    await appendJobEvent(supabase, jobId, "url_error", { scope: "sandbox", error: msg });
    throw new Error(msg);
  }

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
      await saveJobCheckpoint(supabase, jobId, { currentUrlIndex: i, results, errors, blockedCount });
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

      if (dnaResult.dna) {
        const dna = dnaResult.dna as Record<string, unknown>;
        
        if (dnaResult.blockedReason) {
          blockedCount += 1;
          const blockedRec = { url, index: i, error: dnaResult.blockedReason, kind: "blocked" };
          errors.push(blockedRec);
          await appendJobEvent(supabase, jobId, "url_blocked", blockedRec);
        }
        
        // Valida qualidade mínima — quality_score vem calibrado pelo DNA validator (Refero)
        const qualityScore = Number(dna.quality_score ?? 0);
        if (qualityScore < 4) {
          const msg = `DNA quality score ${qualityScore}/10 below minimum threshold (4/10)`;
          errors.push({ url, index: i, error: msg, kind: "quality_threshold" });
          await appendJobEvent(supabase, jobId, "quality_error", { url, qualityScore, reason: msg });
          continue;
        }

        // Valida campos obrigatórios
        const requiredFields = ['layout', 'color', 'typography'];
        const missingFields = requiredFields.filter(field => !dna[field]);
        if (missingFields.length > 0) {
          const msg = `DNA missing required fields: ${missingFields.join(', ')}`;
          errors.push({ url, index: i, error: msg, kind: "missing_fields" });
          await appendJobEvent(supabase, jobId, "validation_error", { url, missingFields });
          continue;
        }

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

  currentMeta.current_url_index = urls.length;
  currentMeta.urls_completed = completedCount;
  currentMeta.blocked_urls = blockedCount;
  currentMeta.progress = 100;
  await supabase
    .from("design_dna_jobs")
    .update({ results, errors, meta: currentMeta })
    .eq("id", jobId);

  const firstError = errors.find((e) => typeof e.error === "string" && (e as Record<string, unknown>).error)
    ?.error as string | undefined;

  return {
    ok: status === "completed",
    status,
    jobId,
    resumable: false,
    canceled: false,
    error: firstError ?? (status === "blocked" ? "Todos os sites retornaram blocked" : undefined),
    urlsCompleted: completedCount,
    durationMs: Date.now() - startMs,
  };
}
