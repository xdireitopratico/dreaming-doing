import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import type { BoardroomMessage, BoardroomPhase } from "../PrometheusBoardroom";
import type { Node, Edge } from "@/types/xyflow-react-shim";

const PHASE_ORDER: BoardroomPhase[] = [
  "discovery", "clarification", "planning", "approval",
  "building", "testing", "review", "deploying", "complete",
];

const WATCHDOG_TIMEOUT_MS = 180_000;
const WATCHDOG_MAX_RETRIES = 3;
const POLL_MIN_INTERVAL_MS = 2_000;
const POLL_MAX_INTERVAL_MS = 15_000;

function mapMessageType(dbType: string): BoardroomMessage["type"] {
  switch (dbType) {
    case "architecture": return "architecture";
    case "prompt_write":
    case "generation": return "prompt_write";
    case "test_result": return "test_result";
    case "user_input": return "user_input";
    case "decision": return "decision";
    case "analysis":
    case "tool_call": return "analysis";
    default:
      console.warn(`[mapMessageType] Unknown type: "${dbType}" — falling back to analysis`);
      return "analysis";
  }
}

export function usePrometheusBoardroom(flowId: string) {
  const [messages, setMessages] = useState<BoardroomMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<BoardroomPhase>("discovery");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [canvasNodes, setCanvasNodes] = useState<Node[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(true);
  const [tokenUsage, setTokenUsage] = useState<{ used: number; budget: number } | null>(null);
  const tokenWarningFiredRef = useRef(false);
  ;
  const startedRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRetriesRef = useRef(0);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef(POLL_MIN_INTERVAL_MS);
  const lastTurnCreatedAtRef = useRef<string | null>(null);
  const processedTurnIdsRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isStreamingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const currentPhaseRef = useRef<BoardroomPhase>("discovery");

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    currentPhaseRef.current = currentPhase;
  }, [currentPhase]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isStreamingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const hydrateTurnsRef = useRef<((sid: string, onlyNew?: boolean) => Promise<number>) | null>(null);

  const resetWatchdog = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(async () => {
      watchdogRetriesRef.current += 1;
      const sid = sessionIdRef.current;
      console.warn(`[boardroom] Watchdog: no turn in 180s (attempt ${watchdogRetriesRef.current}/${WATCHDOG_MAX_RETRIES})`);

      if (sid && hydrateTurnsRef.current && watchdogRetriesRef.current <= WATCHDOG_MAX_RETRIES) {
        // Also check session phase — maybe backend advanced but realtime missed it
        const [found, sessionCheck] = await Promise.all([
          hydrateTurnsRef.current(sid, true),
          supabase
            .from("prometheus_build_sessions" as any)
            .select("phase")
            .eq("id", sid)
            .single(),
        ]);

        const dbPhase = (sessionCheck.data as any)?.phase as BoardroomPhase | undefined;

        // If phase advanced in DB but we missed it, sync immediately
        if (dbPhase && dbPhase !== currentPhaseRef.current) {
          const newIndex = Math.max(0, PHASE_ORDER.indexOf(dbPhase));
          setCurrentPhase(dbPhase);
          setPhaseIndex(newIndex);
          watchdogRetriesRef.current = 0;
          if (dbPhase === "approval" || dbPhase === "complete") {
            setIsStreaming(false);
          } else {
            resetWatchdog();
          }
          return;
        }

        if (found > 0) {
          watchdogRetriesRef.current = 0;
          resetWatchdog();
        } else if (watchdogRetriesRef.current < WATCHDOG_MAX_RETRIES) {
          resetWatchdog();
        } else {
          // Max retries — session is stalled. Show error with recovery hint.
          console.warn("[boardroom] Watchdog: max retries reached, session stalled");
          setIsStreaming(false);
          setError("A sessão não está respondendo. Envie uma mensagem para retomar ou volte ao briefing.");
        }
      } else {
        setIsStreaming(false);
        setError("A sessão não está respondendo. Envie uma mensagem para retomar ou volte ao briefing.");
      }
    }, WATCHDOG_TIMEOUT_MS);
  }, []);

  const syncPhaseState = useCallback((phase: BoardroomPhase) => {
    const newIndex = Math.max(0, PHASE_ORDER.indexOf(phase));
    setCurrentPhase(phase);
    setPhaseIndex(newIndex);

    if (phase === "complete") {
      setIsStreaming(false);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    }
  }, []);

  const isHydratingRef = useRef(false);

  const processTurnRow = useCallback((row: any) => {
    if (row.output_data?.type === "session_summary") {
      if (row.created_at) lastTurnCreatedAtRef.current = row.created_at;
      return false;
    }

    if (row.id) {
      if (processedTurnIdsRef.current.has(row.id)) return false;
      processedTurnIdsRef.current.add(row.id);
    }

    // During live streaming (not hydration), skip user_input — already added locally by sendFeedback
    if (!isHydratingRef.current && (row.message_type === "user_input" || row.agent_key === "user")) {
      return false;
    }

    if (row.created_at) {
      lastTurnCreatedAtRef.current = row.created_at;
    }

    // Step 17: Prepend ReAct tool activity to content
    let displayContent = row.content || "";
    const toolCalls = row.output_data?.tool_calls ?? row.tool_calls;
    if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
      const toolLines = toolCalls.map((tc: { tool: string; params?: Record<string, unknown>; success?: boolean }) => {
        const icon = tc.tool.startsWith("research") || tc.tool === "fetch_page" ? "🔍"
          : tc.tool.startsWith("search") ? "🔎"
          : tc.tool.startsWith("execute") || tc.tool.startsWith("test") ? "🧪"
          : tc.tool === "diagnose_failure" ? "🔬"
          : tc.tool === "create_http_tool" || tc.tool === "create_rag_collection" ? "🛠️"
          : "⚙️";
        const label = tc.tool.replace(/_/g, " ");
        const param = tc.params?.query || tc.params?.url || tc.params?.name || "";
        const status = tc.success === false ? " ❌" : "";
        return `${icon} ${label}${param ? `: ${String(param).substring(0, 60)}` : ""}${status}`;
      }).join("\n");
      displayContent = toolLines + "\n\n" + displayContent;
    }

    const msg: BoardroomMessage = {
      agent: row.agent_key,
      content: displayContent,
      timestamp: new Date(row.created_at).getTime(),
      type: mapMessageType(row.message_type),
      phase: row.phase as BoardroomPhase,
      metadata: row.output_data || undefined,
    };

    setMessages((prev) => [...prev, msg]);
    syncPhaseState(row.phase as BoardroomPhase);

    if (row.agent_key === "architect" && row.output_data) {
      const data = row.output_data;
      // Architecture data may be at top level or nested under .architecture
      const archData = (data.nodes && Array.isArray(data.nodes)) ? data : data.architecture;

      if (archData?.nodes && Array.isArray(archData.nodes)) {
        setCanvasNodes(archData.nodes.map((n: any, i: number) => ({
          id: n.id || `node_${i}`,
          type: n.type || "default",
          position: n.position || { x: 250, y: i * 120 },
          data: { label: n.label || n.type, config: n.config || {} },
        })));
      }

      const edgeSource = (data.edges && Array.isArray(data.edges)) ? data : archData;
      if (edgeSource?.edges && Array.isArray(edgeSource.edges)) {
        setCanvasEdges(edgeSource.edges.map((e: any, i: number) => ({
          id: e.id || `edge_${i}`,
          source: e.source,
          target: e.target,
        })));
      }
    }

    const waitingForUser = Boolean(row.output_data?.decision_fork);

    if (row.phase === "complete" || row.output_data?.final === true) {
      setIsStreaming(false);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
    } else if (waitingForUser) {
      setIsStreaming(false);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRetriesRef.current = 0;
    } else {
      watchdogRetriesRef.current = 0;
      resetWatchdog();
    }

    return true;
  }, [resetWatchdog, syncPhaseState]);

  const hydrateTurns = useCallback(async (sid: string, onlyNew = false) => {
    let query = supabase
      .from("prometheus_build_turns" as any)
      .select("*")
      .eq("session_id", sid)
      .order("created_at", { ascending: true });

    if (onlyNew && lastTurnCreatedAtRef.current) {
      query = query.gt("created_at", lastTurnCreatedAtRef.current);
    }

    const { data: existingTurns } = await query;
    let insertedCount = 0;

    if (existingTurns?.length) {
      isHydratingRef.current = !onlyNew;
      for (const row of existingTurns) {
        if (processTurnRow(row)) insertedCount += 1;
      }
      isHydratingRef.current = false;
    }

    return insertedCount;
  }, [processTurnRow]);

  // Keep ref in sync for watchdog access
  useEffect(() => {
    hydrateTurnsRef.current = hydrateTurns;
  }, [hydrateTurns]);

  const schedulePolling = useCallback((sid: string) => {
    clearPolling();

    const runPoll = async () => {
      try {
        const [{ data: sessionData }, insertedCount] = await Promise.all([
          supabase
            .from("prometheus_build_sessions" as any)
            .select("phase")
            .eq("id", sid)
            .single(),
          hydrateTurns(sid, true),
        ]);

        const session = sessionData as { phase?: BoardroomPhase } | null;
        let hasUpdate = insertedCount > 0;

        if (session?.phase && session.phase !== currentPhaseRef.current) {
          syncPhaseState(session.phase);
          hasUpdate = true;
        }

        if (session?.phase === "complete") {
          clearPolling();
          return;
        }

        pollIntervalRef.current = hasUpdate
          ? POLL_MIN_INTERVAL_MS
          : Math.min(Math.round(pollIntervalRef.current * 1.5), POLL_MAX_INTERVAL_MS);
      } catch (pollError) {
        console.warn("[boardroom] Polling fallback error:", pollError);
        pollIntervalRef.current = Math.min(Math.round(pollIntervalRef.current * 1.5), POLL_MAX_INTERVAL_MS);
      }

      pollingRef.current = setTimeout(runPoll, pollIntervalRef.current);
    };

    pollingRef.current = setTimeout(runPoll, pollIntervalRef.current);
  }, [clearPolling, hydrateTurns, syncPhaseState]);

  const subscribeToSession = useCallback((sid: string) => {
    const channel = supabase
      .channel(`prometheus-boardroom-${sid}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "prometheus_build_turns",
          filter: `session_id=eq.${sid}`,
        },
        (payload: any) => {
          pollIntervalRef.current = POLL_MIN_INTERVAL_MS;
          processTurnRow(payload.new);
        },
      )
      .subscribe();

    channelRef.current = channel;
    schedulePolling(sid);
  }, [processTurnRow, schedulePolling]);

  const startFreshSession = useCallback(async () => {
    const { data: flowData, error: flowError } = await supabase
      .from("agent_flows")
      .select("flow_definition")
      .eq("id", flowId)
      .single();

    if (flowError) {
      console.error("[boardroom] Failed to fetch flow:", flowError.message);
      setError("Erro ao carregar dados do fluxo. Verifique suas permissões.");
      setIsStreaming(false);
      return;
    }

    const briefing = (flowData?.flow_definition as any)?.briefing || {};
    const modelId = briefing?.quality_model || "";

    const { data, error: fnError } = await supabase.functions.invoke("prometheus-builder", {
      body: { action: "start", flow_id: flowId, briefing, model_id: modelId },
    });

    if (fnError || !data?.session_id) {
      console.error("[boardroom] Failed to start session:", fnError);
      setError("Falha ao iniciar sessão. Tente novamente.");
      setIsStreaming(false);
      return;
    }

    const sid = data.session_id;
    setSessionId(sid);
    await hydrateTurns(sid);
    subscribeToSession(sid);
    resetWatchdog();
  }, [flowId, hydrateTurns, resetWatchdog, subscribeToSession]);

  useEffect(() => {
    if (!ready || startedRef.current) return;

    startedRef.current = true;
    setIsStreaming(true);
    setError(null);
    setMessages([]);
    setCanvasNodes([]);
    setCanvasEdges([]);
    processedTurnIdsRef.current.clear();
    lastTurnCreatedAtRef.current = null;
    pollIntervalRef.current = POLL_MIN_INTERVAL_MS;

    (async () => {
      try {
        const { data: existingSessions } = await supabase
          .from("prometheus_build_sessions" as any)
          .select("id, phase")
          .eq("target_flow_id", flowId)
          .not("phase", "eq", "complete")
          .order("created_at", { ascending: false })
          .limit(1);

        const existingSession = existingSessions?.[0];

        if (existingSession) {
          const sid = (existingSession as any).id;
          const resumePhase = (existingSession as any).phase as BoardroomPhase;

          setSessionId(sid);
          syncPhaseState(resumePhase);
          const recoveredTurns = await hydrateTurns(sid);

          const isOrphanDiscoverySession = recoveredTurns === 0 && resumePhase === "discovery";
          if (!isOrphanDiscoverySession) {
            subscribeToSession(sid);

            if (["building", "testing", "review", "deploying"].includes(resumePhase)) {
              resetWatchdog();
            } else {
              setIsStreaming(false);
              resetWatchdog();
            }
            return;
          }

          console.warn("[boardroom] Ignoring orphan discovery session with no turns:", sid);
          setSessionId(null);
        }

        await startFreshSession();
      } catch (err) {
        console.error("[boardroom] Init error:", err);
        setError("Erro ao conectar com o sistema. Tente novamente.");
        setIsStreaming(false);
      }
    })();

    return () => {
      startedRef.current = false;
      clearPolling();
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [flowId, ready, hydrateTurns, startFreshSession, subscribeToSession, resetWatchdog, clearPolling, syncPhaseState]);

  useEffect(() => {
    return () => {
      // Do not auto-summarize on every remount/navigation while planning.
      // This was creating noisy synthetic turns and extra LLM calls.
    };
  }, []);

  const sendFeedback = useCallback(async (text: string) => {
    if (!sessionId) return;

    const userMsg: BoardroomMessage = {
      agent: "user",
      content: text,
      timestamp: Date.now(),
      type: "user_input",
      phase: currentPhase,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setError(null);
    resetWatchdog();
    pollIntervalRef.current = POLL_MIN_INTERVAL_MS;

    try {
      const { error: fnError } = await supabase.functions.invoke("prometheus-builder", {
        body: { action: "message", session_id: sessionId, message: text },
      });

      if (fnError) {
        console.error("[boardroom] sendFeedback error:", fnError);
        setError("Erro ao enviar mensagem. Tente novamente.");
        setIsStreaming(false);
      }
    } catch (err) {
      console.error("[boardroom] sendFeedback error:", err);
      setError("Erro ao enviar mensagem. Tente novamente.");
      setIsStreaming(false);
    }
  }, [currentPhase, sessionId, resetWatchdog]);

  const skip = useCallback(async () => {
    if (sessionId) {
      try {
        await supabase.functions.invoke("prometheus-builder", {
          body: { action: "halt", session_id: sessionId },
        });
      } catch (err) {
        console.warn("[boardroom] halt failed:", err);
      }
    }
    setIsStreaming(false);
    clearPolling();
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
  }, [clearPolling, sessionId]);

  const startBuild = useCallback(() => {
    setReady(true);
  }, []);

  // Step 18: Poll token usage from session
  useEffect(() => {
    if (!sessionId || !isStreaming) return;
    let cancelled = false;

    const poll = async () => {
      const { data } = await supabase
        .from("prometheus_build_sessions" as any)
        .select("tokens_used, token_budget")
        .eq("id", sessionId)
        .single();
      if (!cancelled && (data as any)?.token_budget) {
        const used = (data as any).tokens_used || 0;
        const budget = (data as any).token_budget;
        setTokenUsage({ used, budget });
        const pct = Math.round((used / budget) * 100);
        if (pct >= 80 && !tokenWarningFiredRef.current) {
          tokenWarningFiredRef.current = true;
          toast({
            title: "⚠️ Orçamento de tokens a " + pct + "%",
            description: "O agente está próximo do limite. Considere revisar ou ampliar o budget.",
          });
        }
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [sessionId, isStreaming]);

  return {
    messages,
    isStreaming,
    currentPhase,
    phaseIndex,
    canvasNodes,
    canvasEdges,
    sendFeedback,
    skip,
    error,
    sessionId,
    ready,
    startBuild,
    tokenUsage,
  };
}
