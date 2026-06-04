// useSSE.ts — Hook para consumir streaming SSE do agent-run
// Conecta em /agent-run?stream=true, parseia eventos text/event-stream
// Expõe fase atual, tools em execução, custo, timeline de ações
import { useState, useRef, useCallback, useEffect } from "react";

const SUPABASE_URL = typeof import.meta !== "undefined"
  ? (import.meta as any).env?.VITE_SUPABASE_URL ?? ""
  : "";
const SUPABASE_ANON_KEY = typeof import.meta !== "undefined"
  ? (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""
  : "";

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

// Custo estimado por token por modelo ($/1M tokens)
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

export function useSSE() {
  const [progress, setProgress] = useState<AgentProgress>(initialState);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback((projectId: string, conversationId: string) => {
    // Reset state
    setProgress(initialState);
    setConnected(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const functionsUrl = `${SUPABASE_URL}/functions/v1/agent-run`;
    const url = `${functionsUrl}?stream=true&sse=true`;

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ projectId, conversationId }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          setProgress((p) => ({ ...p, error: `HTTP ${res.status}`, finished: true }));
          setConnected(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setProgress((p) => ({ ...p, error: "No response body", finished: true }));
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
                // Linha não-JSON (heartbeat, comentário) — ignora
              }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setProgress((p) => ({ ...p, error: err.message, finished: true }));
        }
        setConnected(false);
      })
      .finally(() => {
        setConnected(false);
      });
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    setConnected(false);
    setProgress((p) => ({ ...p, finished: true }));
  }, []);

  // Cleanup on unmount
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
    case "validate_fail":
      return {
        ...prev,
        runtimeChecks: [
          ...prev.runtimeChecks,
          ...((data.checks as Array<{ name: string; ok: boolean }>) ?? [{ name: "build", ok: type === "validate_ok" }]),
        ],
        timeline: [...prev.timeline, event],
      };

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
