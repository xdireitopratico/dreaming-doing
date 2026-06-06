import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ensureAgentProjectSandbox, syncProjectFilesToSandbox } from "../_shared/project-sandbox.ts";
import { getSystemPrompt, EXECUTE_PROMPT } from "./prompts.ts";
import type { ProviderConfig } from "./providers.ts";
import { bootstrapE2bWorker, buildSandboxEnv, type WorkerRunConfig } from "./worker-bootstrap.ts";
import { streamWorkerEvents, WORKER_RELAY_MS } from "./worker-stream.ts";
import { FORGE_CORS_HEADERS } from "../_shared/cors.ts";

const corsHeaders = FORGE_CORS_HEADERS;

export function supportsE2bWorker(cfg: ProviderConfig): boolean {
  if (cfg.provider === "anthropic") return false;
  return true;
}

type WorkerRunParams = {
  supabase: SupabaseClient;
  e2bApiKey: string;
  userId: string;
  accessToken: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  projectId: string;
  conversationId: string;
  agentRunId: string;
  resumeRun: boolean;
  projectTemplate: string;
  stackAddon: string;
  sessionAddon: string;
  mainCfg: ProviderConfig;
  connectorKeys: Record<string, string>;
  deployKeys: Record<string, string>;
  files: Array<{ path: string; content?: string | null }>;
  runnerSource: string;
  cleanup: () => void;
  /** Continuação do relay SSE — worker já está rodando no sandbox. */
  relayOnly?: boolean;
  streamOffset?: number;
};

export function runAgentViaE2bWorker(params: WorkerRunParams): Response {
  const stream = new ReadableStream({
    start(controller) {
      const emit = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* closed */ }
      };

      (async () => {
        let releaseLock = true;
        try {
          const { sandbox } = await ensureAgentProjectSandbox(
            params.supabase,
            params.projectId,
            params.e2bApiKey,
          );

          if (!params.relayOnly) {
            await syncProjectFilesToSandbox(sandbox, params.files);

            const systemPrompt = [
              getSystemPrompt(params.projectTemplate),
              params.stackAddon,
              params.sessionAddon,
              EXECUTE_PROMPT,
            ].filter(Boolean).join("\n\n");

            const workerConfig: WorkerRunConfig = {
              runId: params.agentRunId,
              projectId: params.projectId,
              conversationId: params.conversationId,
              supabaseUrl: params.supabaseUrl,
              supabaseAnonKey: params.supabaseAnonKey,
              accessToken: params.accessToken,
              resume: params.resumeRun,
              maxSteps: 48,
              workerMaxMs: 25 * 60 * 1000,
              systemPrompt,
              llm: {
                provider: params.mainCfg.provider,
                apiKey: params.mainCfg.apiKey,
                model: params.mainCfg.model,
                baseUrl: params.mainCfg.baseUrl,
              },
              env: buildSandboxEnv(params.connectorKeys, params.deployKeys),
            };

            await bootstrapE2bWorker(sandbox, params.runnerSource, workerConfig);

            emit({
              type: "start",
              projectId: params.projectId,
              conversationId: params.conversationId,
              runId: params.agentRunId,
              provider: params.mainCfg.label,
              worker: true,
              resume: params.resumeRun,
            });
          } else {
            emit({
              type: "relay_resume",
              runId: params.agentRunId,
              offset: params.streamOffset ?? 0,
            });
          }

          const isCanceled = async () => {
            const { data } = await params.supabase
              .from("agent_runs")
              .select("status, canceled_at")
              .eq("id", params.agentRunId)
              .maybeSingle();
            return data?.status === "canceled" || !!data?.canceled_at;
          };

          const result = await streamWorkerEvents(
            sandbox,
            emit,
            isCanceled,
            {
              startOffset: params.streamOffset ?? 0,
              maxRelayMs: WORKER_RELAY_MS,
            },
          );

          if (result.handoff) {
            releaseLock = false;
            return;
          }

          await params.supabase
            .from("agent_runs")
            .update({
              status: result.canceled ? "canceled" : result.ok ? "completed" : "failed",
              finished_at: new Date().toISOString(),
              steps: result.steps,
              error: result.error ?? null,
              ...(result.canceled ? { canceled_at: new Date().toISOString() } : {}),
            })
            .eq("id", params.agentRunId);

          emit({
            type: "finish",
            ...result,
            resumable: !result.ok && !result.canceled,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "erro no agente";
          emit({ type: "error", error: msg, recoverable: true });
          emit({ type: "finish", ok: false, error: msg, steps: 0, resumable: true });
        } finally {
          if (releaseLock) params.cleanup();
          try { controller.close(); } catch { /* */ }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}