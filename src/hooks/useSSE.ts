// useSSE.ts — Streaming SSE do agent-run (motor de prompt)
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { parseAgentDiagnostics, pushDiagnostics } from "@/hooks/useDiagnostics";

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
}

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
};

const MODEL_COSTS: Record<string, number> = {
  "claude-sonnet-4-20250514": 3.0,
  "claude-3-5-sonnet": 3.0,
  "claude-3-opus": 15.0,
  "claude-3-haiku": 0.25,
  "gpt-4o": 2.5,
  "gpt-4o-mini": 0.15,
  "gemini-1.5-pro": 1.25,
  "gemini-1.5-flash": 0.075,
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

  const connect = useCallback(async (projectId: string, conversationId: string) => {
    setProgress(initialState);
    setConnected(true);

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

    const controller = new AbortController();
    abortRef.current = controller;

    const functionsUrl = `${url}/functions/v1/agent-run`;

    try {
      const res = await fetch(functionsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          Authorization: `Bearer ${accessToken}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({ projectId, conversationId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const msg = await parseErrorResponse(res);
        setProgress((p) => ({ ...p, error: msg, finished: true }));
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
              const parsed = JSON.parse(json);
              const event: SSEEvent = { ...parsed, timestamp: Date.now() };
              setProgress((prev) => applyEvent(prev, event));
            } catch {
              /* heartbeat */
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setProgress((p) => ({ ...p, error: err.message, finished: true }));
      }
    } finally {
      setConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    setConnected(false);
    setProgress((p) => ({ ...p, finished: true }));
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return { progress, connected, connect, disconnect };
}

function applyEvent(prev: AgentProgress, event: SSEEvent): AgentProgress {
  const { type, data } = event;

  switch (type) {
    case "phase":
      return {
        ...prev,
        phase: (data.phase as string) ?? prev.phase,
        message: (data.message as string) ?? prev.message,
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
        timeline: [...prev.timeline, event],
      };

    case "error":
      return {
        ...prev,
        error: (data.error as string) ?? "Erro desconhecido",
        finished: true,
        timeline: [...prev.timeline, event],
      };

    case "finish":
      return {
        ...prev,
        finished: true,
        timeline: [...prev.timeline, event],
      };

    default:
      return { ...prev, timeline: [...prev.timeline, event] };
  }
}

function estimateCost(model: string, tokens: number): number {
  const costPerM = MODEL_COSTS[model] ?? MODEL_COSTS.default;
  return (tokens / 1_000_000) * costPerM;
}