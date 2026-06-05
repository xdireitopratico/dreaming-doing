// useSSE.ts — Streaming SSE do agent-run (motor de prompt)
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { parseAgentDiagnostics, pushDiagnostics } from "@/hooks/useDiagnostics";
import { loadAgentPreferences } from "@/lib/agent-preferences";
import { loadAgentSessionExtensions } from "@/lib/agent-session-extensions";
import type { ForgeSessionKind } from "@/lib/taste";
import { dispatchTasteUiAction, isTasteUiAction } from "@/lib/taste-ui-actions";
import { formatAgentFetchError } from "@/lib/agent-fetch-errors";
import { logEditorTelemetryEvent } from "@/lib/editor-telemetry";
import { cancelAgentRun } from "@/lib/agent-cancel";

export interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface AgentProgress {
  phase: string | null;
  message: string | null;
  currentStep: number | null;
  totalSteps: number | null;
  tools: Array<{ name: string; args: Record<string, unknown>; ok?: boolean; error?: string }>;
  cost: number;
  model: string | null;
  skills: string[];
  runtimeChecks: Array<{ name: string; ok: boolean }>;
  timeline: SSEEvent[];
  summary: string | null;
  error: string | null;
  finished: boolean;
  /** Pode retomar após queda de conexão ou rate limit */
  resumable: boolean;
  /** Aviso amigável (ROBIN / rate limit) */
  statusHint: string | null;
  /** Texto do modelo ainda em voo (SSE assistant_text), antes de persistir no DB. */
  streamText: string | null;
}

export type AgentConnectOptions = {
  /** Retoma após queda de conexão ou limite — não reinicia o chat do zero */
  resume?: boolean;
};

const initialState: AgentProgress = {
  phase: null,
  message: null,
  currentStep: null,
  totalSteps: null,
  tools: [],
  cost: 0,
  model: null,
  skills: [],
  runtimeChecks: [],
  timeline: [],
  summary: null,
  error: null,
  finished: false,
  resumable: false,
  statusHint: null,
  streamText: null,
};

const MODEL_COSTS: Record<string, number> = {
  "claude-sonnet-4-20250514": 3.0,
  "claude-opus-4-20250514": 15.0,
  "gpt-4o": 2.5,
  "gpt-4.1": 2.0,
  "grok-3": 2.0,
  "grok-3-mini": 0.5,
  "gemini-2.5-pro": 1.25,
  "gemini-2.5-flash": 0.15,
  "llama-3.3-70b-versatile": 0,
  "meta/llama-3.3-70b-instruct": 0,
  default: 1.0,
};

async function parseErrorResponse(res: Response): Promise<string> {
  const txt = await res.text().catch(() => "");
  try {
    const body = JSON.parse(txt) as { error?: string; message?: string };
    return body.error ?? body.message ?? txt.slice(0, 280);
  } catch {
    return txt.slice(0, 280) || `HTTP ${res.status}`;
  }
}

export function useSSE() {
  const [progress, setProgress] = useState<AgentProgress>(initialState);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  const connect = useCallback(async (
    projectId: string,
    conversationId: string,
    sessionKind?: ForgeSessionKind,
    options?: AgentConnectOptions,
  ) => {
    const isResume = options?.resume === true;
    setProgress({
      ...initialState,
      statusHint: isResume ? "Conectando para retomar o agente…" : null,
      resumable: false,
    });
    const sawFinish = { current: false };

    const { url, publishableKey } = getSupabaseEnv();
    if (!url || !publishableKey) {
      setProgress((p) => ({
        ...p,
        error: "Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.",
        finished: true,
      }));
      setConnected(false);
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess.session?.access_token;
    if (!accessToken) {
      setProgress((p) => ({
        ...p,
        error: "Sessão expirada. Faça login novamente.",
        finished: true,
      }));
      setConnected(false);
      return;
    }

    runIdRef.current = null;
    const controller = new AbortController();
    abortRef.current = controller;

    const functionsUrl = `${url}/functions/v1/agent-run`;

    setConnected(true);
    logEditorTelemetryEvent(
      "sse",
      "connect_start",
      "info",
      sessionKind ?? "auto",
    );

    try {
      const res = await fetch(functionsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${accessToken}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({
          projectId,
          conversationId,
          preferences: loadAgentPreferences(),
          sessionKind,
          resume: isResume,
          ...loadAgentSessionExtensions(),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const msg = await parseErrorResponse(res);
        logEditorTelemetryEvent("sse", "http_error", "error", `${res.status} ${msg.slice(0, 120)}`);
        const canRetry = res.status === 409 || res.status >= 500;
        setProgress((p) => ({
          ...p,
          error: msg,
          finished: true,
          resumable: canRetry || isResume,
        }));
        setConnected(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setProgress((p) => ({ ...p, error: "Resposta vazia do agent-run", finished: true }));
        setConnected(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const json = line.slice(6);
            try {
              const parsed = JSON.parse(json) as Record<string, unknown>;
              const eventType = (parsed.type as string) ?? "unknown";
              const eventData =
                parsed.data && typeof parsed.data === "object"
                  ? (parsed.data as Record<string, unknown>)
                  : { ...parsed, type: undefined };
              const event: SSEEvent = {
                type: eventType,
                data: eventData,
                timestamp: Date.now(),
              };
              if (eventType === "ui_action" && isTasteUiAction(parsed)) {
                dispatchTasteUiAction(parsed as Parameters<typeof dispatchTasteUiAction>[0]);
              }
              if (event.type === "start" && typeof eventData.runId === "string") {
                runIdRef.current = eventData.runId;
              }
              if (event.type === "finish" || event.type === "done") {
                sawFinish.current = true;
                runIdRef.current = null;
                logEditorTelemetryEvent("sse", "finish", "ok");
              }
              if (event.type === "error") {
                logEditorTelemetryEvent(
                  "sse",
                  "stream_error",
                  "error",
                  String(event.data.error ?? "").slice(0, 200),
                );
              }
              if (event.type === "phase") {
                logEditorTelemetryEvent(
                  "agent",
                  "phase",
                  "info",
                  String(event.data.phase ?? ""),
                );
              }
              setProgress((prev) => applyAgentProgressEvent(prev, event));
            } catch {
              /* heartbeat */
            }
          }
        }
      }
      if (!sawFinish.current) {
        setProgress((p) => ({
          ...p,
          finished: true,
          resumable: true,
          error:
            p.error ??
            "Conexão com o agente foi interrompida. Seu histórico está salvo no projeto — use Continuar.",
        }));
      }
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        setProgress((p) => ({
          ...p,
          error: formatAgentFetchError(err),
          finished: true,
          resumable: true,
        }));
      }
    } finally {
      setConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    runIdRef.current = null;
    setConnected(false);
    setProgress((p) => ({ ...p, finished: true }));
  }, []);

  /** Aborta o SSE e solicita cancelamento server-side (C22). */
  const stop = useCallback(async () => {
    const runId = runIdRef.current;
    if (runId) {
      try {
        await cancelAgentRun(runId);
        logEditorTelemetryEvent("agent", "cancel_request", "info", runId.slice(0, 8));
      } catch {
        /* edge pode já ter encerrado */
      }
      runIdRef.current = null;
    }
    abortRef.current?.abort();
    setConnected(false);
    setProgress((p) => ({ ...p, finished: true, resumable: false }));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { progress, connected, connect, disconnect, stop };
}

/** Reducer puro dos eventos SSE (exportado para testes). */
export function applyAgentProgressEvent(prev: AgentProgress, event: SSEEvent): AgentProgress {
  const { type, data } = event;

  switch (type) {
    case "start":
      return {
        ...prev,
        error: null,
        finished: false,
        resumable: false,
        statusHint: data.resume
          ? "Retomando com a memória salva no chat…"
          : prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "canceled":
      return {
        ...prev,
        finished: true,
        resumable: false,
        error: (data.message as string) ?? "Cancelado pelo usuário",
        timeline: [...prev.timeline, event],
      };

    case "assistant_text": {
      const chunk = (data.text as string) ?? "";
      return {
        ...prev,
        // Cada passo do loop substitui o rascunho — evita texto “puxando”/acumulando errado.
        streamText: chunk,
        timeline: [...prev.timeline, event],
      };
    }

    case "phase":
      return {
        ...prev,
        phase: (data.phase as string) ?? prev.phase,
        message: (data.message as string) ?? prev.message,
        statusHint:
          data.phase === "resume"
            ? ((data.message as string) ?? prev.statusHint)
            : null,
        timeline: [...prev.timeline, event],
      };

    case "memory":
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "context_pressure":
    case "context_compress":
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "rate_limit":
      return {
        ...prev,
        statusHint: (data.message as string) ?? "Rate limit — ROBIN alternando chave…",
        timeline: [...prev.timeline, event],
      };

    case "robin_rotate":
      return {
        ...prev,
        statusHint: (data.message as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };

    case "connection_retry":
      return {
        ...prev,
        statusHint: (data.message as string) ?? "Reconectando ao modelo…",
        timeline: [...prev.timeline, event],
      };

    case "classify":
      return {
        ...prev,
        model: (data.model as string) ?? prev.model,
        timeline: [...prev.timeline, event],
      };

    case "skills":
      return {
        ...prev,
        skills: (data.active as string[]) ?? prev.skills,
        timeline: [...prev.timeline, event],
      };

    case "tool_start":
      return {
        ...prev,
        tools: [
          ...prev.tools,
          { name: (data.name as string) ?? "?", args: (data.args as Record<string, unknown>) ?? {} },
        ],
        timeline: [...prev.timeline, event],
      };

    case "tool_done": {
      const toolName = data.name as string;
      return {
        ...prev,
        tools: prev.tools.map((t) =>
          t.name === toolName ? { ...t, ok: data.ok as boolean, error: data.error as string } : t,
        ),
        cost: prev.cost + estimateCost(prev.model ?? "default", 2000),
        timeline: [...prev.timeline, event],
      };
    }

    case "validate_ok":
      return {
        ...prev,
        runtimeChecks: [
          ...prev.runtimeChecks,
          ...((data.checks as Array<{ name: string; ok: boolean }>) ?? [{ name: "build", ok: true }]),
        ],
        timeline: [...prev.timeline, event],
      };

    case "validate_fail": {
      const diags = parseAgentDiagnostics(data);
      pushDiagnostics(diags);
      return {
        ...prev,
        runtimeChecks: [
          ...prev.runtimeChecks,
          ...((data.checks as Array<{ name: string; ok: boolean }>) ?? [{ name: "build", ok: false }]),
        ],
        timeline: [...prev.timeline, event],
      };
    }

    case "done":
      return {
        ...prev,
        summary: (data.summary as string) ?? prev.summary,
        finished: true,
        resumable: false,
        error: null,
        streamText: null,
        timeline: [...prev.timeline, event],
      };

    case "error":
      return {
        ...prev,
        error: (data.message as string) ?? (data.error as string) ?? "Erro desconhecido",
        finished: true,
        resumable: data.recoverable === true || prev.resumable,
        timeline: [...prev.timeline, event],
      };

    case "finish": {
      const failed = data.ok === false;
      return {
        ...prev,
        finished: true,
        streamText: null,
        resumable: failed && data.resumable === true,
        error: failed ? ((data.error as string) ?? prev.error) : null,
        timeline: [...prev.timeline, event],
      };
    }

    case "ui_action": {
      const payload = { ...data };
      delete (payload as { type?: string }).type;
      if (isTasteUiAction(payload)) dispatchTasteUiAction(payload);
      return {
        ...prev,
        statusHint: (data.reason as string) ?? prev.statusHint,
        timeline: [...prev.timeline, event],
      };
    }

    default:
      return { ...prev, timeline: [...prev.timeline, event] };
  }
}

function estimateCost(model: string, tokens: number): number {
  const costPerM = MODEL_COSTS[model] ?? MODEL_COSTS.default;
  return (tokens / 1_000_000) * costPerM;
}