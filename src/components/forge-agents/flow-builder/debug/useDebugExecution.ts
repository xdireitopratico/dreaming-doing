/**
 * useDebugExecution — Hook for debug session execution
 * Calls gateway with debug flag when available, falls back to local simulation
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Node, Edge } from "@/types/xyflow-react-shim";
import { buildExecutionOrder, type BreakpointInfo, type DebugStep, type DebugState, type ConsoleEntry } from "./debug-types";

interface UseDebugExecutionProps {
  nodes: Node[];
  edges: Edge[];
  breakpoints: Map<string, BreakpointInfo>;
  onHighlightNode: (nodeId: string | null) => void;
  flowId?: string;
}

export function useDebugExecution({ nodes, edges, breakpoints, onHighlightNode, flowId }: UseDebugExecutionProps) {
  const [debugState, setDebugState] = useState<DebugState>("idle");
  const [steps, setSteps] = useState<DebugStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [consoleLog, setConsoleLog] = useState<ConsoleEntry[]>([]);
  const [useGateway, setUseGateway] = useState(false);
  const pauseResolveRef = useRef<(() => void) | null>(null);
  const abortRef = useRef(false);

  const log = useCallback((level: ConsoleEntry["level"], message: string) => {
    setConsoleLog((prev) => [...prev, {
      id: `${Date.now()}_${Math.random()}`,
      timestamp: Date.now(),
      level,
      message,
    }]);
  }, []);

  const startDebug = useCallback(async (inputMessage: string) => {
    abortRef.current = false;
    const order = buildExecutionOrder(nodes, edges);
    const initialSteps: DebugStep[] = order.map((id) => {
      const node = nodes.find((n) => n.id === id);
      return {
        nodeId: id,
        nodeLabel: (node?.data?.label as string) || id,
        nodeType: node?.type || "unknown",
        status: "pending" as const,
        input: {},
        output: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
      };
    });

    setSteps(initialSteps);
    setCurrentStepIdx(-1);
    setDebugState("running");
    setConsoleLog([]);
    log("info", "🚀 Debug session started");

    // Try gateway execution first
    if (useGateway && flowId) {
      try {
        log("info", "🌐 Calling gateway with debug mode...");
        const { data: deployment } = await supabase
          .from("agent_deployments")
          .select("endpoint_slug")
          .eq("flow_id", flowId)
          .eq("is_active", true)
          .limit(1)
          .single();

        if (deployment?.endpoint_slug) {
          const { data, error } = await supabase.functions.invoke("aetherforge-gateway", {
            body: { slug: deployment.endpoint_slug, message: inputMessage, channel: "debug", debug: true },
          });

          if (error) throw error;

          const gatewaySteps: DebugStep[] = (data.steps || []).map((s: any) => ({
            nodeId: s.node_id,
            nodeLabel: s.node_type,
            nodeType: s.node_type,
            status: s.status === "error" ? "error" as const : "completed" as const,
            input: s.input || {},
            output: s.output || null,
            startedAt: null,
            completedAt: Date.now(),
            durationMs: s.duration_ms || 0,
          }));

          setSteps(gatewaySteps);
          for (let i = 0; i < gatewaySteps.length; i++) {
            setCurrentStepIdx(i);
            onHighlightNode(gatewaySteps[i].nodeId);
            log("info", `✓ ${gatewaySteps[i].nodeLabel} — ${gatewaySteps[i].durationMs}ms`);
            await new Promise((r) => setTimeout(r, 200));
          }

          setDebugState("completed");
          onHighlightNode(null);
          log("info", "🏁 Debug via gateway completed");
          return;
        }
      } catch (err) {
        log("warn", `⚠ Gateway failed: ${(err as Error).message}. Falling back to local.`);
      }
    }

    // Local simulation with breakpoints
    let prevOutput: Record<string, unknown> = { message: inputMessage };

    for (let i = 0; i < initialSteps.length; i++) {
      if (abortRef.current) {
        log("warn", "⛔ Debug aborted");
        setDebugState("idle");
        onHighlightNode(null);
        return;
      }

      const step = initialSteps[i];
      setCurrentStepIdx(i);
      onHighlightNode(step.nodeId);

      // Check breakpoint
      const bp = breakpoints.get(step.nodeId);
      if (bp?.enabled) {
        log("debug", `⏸ Breakpoint hit: ${step.nodeLabel}`);
        setDebugState("paused");
        setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "paused", input: prevOutput } : s));
        await new Promise<void>((resolve) => { pauseResolveRef.current = resolve; });
        setDebugState("running");
      }

      if (abortRef.current) { setDebugState("idle"); onHighlightNode(null); return; }

      const startTime = performance.now();
      setSteps((prev) => prev.map((s, idx) => idx === i ? { ...s, status: "running", input: prevOutput, startedAt: Date.now() } : s));
      log("info", `▶ ${step.nodeLabel} (${step.nodeType})`);

      await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));

      const output = { result: `[SIMULADO] output de ${step.nodeType}`, nodeId: step.nodeId };
      const durationMs = Math.round(performance.now() - startTime);

      setSteps((prev) => prev.map((s, idx) => idx === i ? {
        ...s, status: "completed", output, completedAt: Date.now(), durationMs,
      } : s));

      log("info", `✓ ${step.nodeLabel} — ${durationMs}ms`);
      prevOutput = output;
    }

    setDebugState("completed");
    onHighlightNode(null);
    log("info", "🏁 Debug completed (simulação local)");
  }, [nodes, edges, breakpoints, useGateway, flowId, log, onHighlightNode]);

  const resumeDebug = useCallback(() => {
    if (pauseResolveRef.current) { pauseResolveRef.current(); pauseResolveRef.current = null; }
  }, []);

  const stopDebug = useCallback(() => {
    abortRef.current = true;
    resumeDebug();
    setDebugState("idle");
    setCurrentStepIdx(-1);
    onHighlightNode(null);
  }, [resumeDebug, onHighlightNode]);

  return {
    debugState, steps, currentStepIdx, consoleLog, useGateway,
    setUseGateway, setConsoleLog,
    startDebug, resumeDebug, stopDebug, log,
    currentStep: currentStepIdx >= 0 ? steps[currentStepIdx] : null,
  };
}
