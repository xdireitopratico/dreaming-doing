/**
 * TestPanel — Executor de flow com gateway real (padrão) e simulação local (fallback)
 * ROADMAP-03 Phase 1: Usa action "test" com flow_id direto — sem deploy obrigatório
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { type Node, type Edge } from "@/types/xyflow-react-shim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { X, Play, Square, RotateCcw, Send, Loader2, CheckCircle2, XCircle, Clock, Wifi, WifiOff, AlertTriangle, Timer } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { TestFeedbackPrompt } from "./TestFeedbackPrompt";

interface ExecutionStep {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: "running" | "completed" | "error" | "skipped";
  input: string;
  output: string;
  duration: number;
  timestamp: number;
}

interface TestPanelProps {
  nodes: Node[];
  edges: Edge[];
  flowId?: string;
  deploymentSlug?: string;
  onHighlightNode: (nodeId: string | null) => void;
  onClose: () => void;
}

export function TestPanel({ nodes, edges, flowId, deploymentSlug, onHighlightNode, onClose }: TestPanelProps) {
  const [testMessage, setTestMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  // Phase 1: Gateway is default when flowId exists — no deployment needed
  const [useGateway, setUseGateway] = useState(!!flowId);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [metrics, setMetrics] = useState<{ tokens_in: number; tokens_out: number; cost_cents: number; latency_ms: number } | null>(null);

  // Phase 9: Timeout visual — progress bar after 15s
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const estimatedMs = Math.max(nodes.length * 3000, 10000); // estimate based on node count

  useEffect(() => {
    if (isRunning) {
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(prev => prev + 500), 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  // Phase 9: beforeunload protection during active test
  useEffect(() => {
    if (!isRunning) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRunning]);

  // Phase 9: Track test count and execution IDs for feedback prompt
  const [testCount, setTestCount] = useState(0);
  const [executionIds, setExecutionIds] = useState<string[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackDismissed, setFeedbackDismissed] = useState(false);

  // Phase 9: Rate limiting visual countdown
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  useEffect(() => {
    if (rateLimitCountdown <= 0) return;
    const t = setInterval(() => setRateLimitCountdown(prev => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [rateLimitCountdown]);

  // Run via real gateway using action "test" with flow_id (no deployment needed)
  const runViaGateway = useCallback(async () => {
    if (!testMessage.trim() || !flowId) return;

    setIsRunning(true);
    setSteps([]);
    setCurrentStepIndex(0);
    setGatewayError(null);
    setMetrics(null);

    try {
      const { data, error } = await supabase.functions.invoke("aetherforge-gateway", {
        body: { action: "test", flow_id: flowId, message: testMessage, session_id: sessionId, channel: "test" },
      });

      if (error) throw error;

      // Handle gateway-level errors (e.g., MODEL_NOT_CONFIGURED)
      if (data?.error) {
        throw new Error(data.error);
      }

      const gatewaySteps: ExecutionStep[] = (data.steps || []).map((s: any) => ({
        nodeId: s.node_id,
        nodeType: s.node_type,
        nodeLabel: s.node_type,
        status: s.status === "error" ? "error" : "completed",
        input: JSON.stringify(s.output).substring(0, 100),
        output: JSON.stringify(s.output),
        duration: s.duration_ms || 0,
        timestamp: Date.now(),
      }));

      setSteps(gatewaySteps);
      setMetrics({
        tokens_in: data.steps?.reduce((sum: number, s: any) => sum + (s.output?.tokens?.prompt || 0), 0) || 0,
        tokens_out: data.steps?.reduce((sum: number, s: any) => sum + (s.output?.tokens?.completion || 0), 0) || 0,
        cost_cents: data.steps?.reduce((sum: number, s: any) => sum + (s.output?.cost_cents || 0), 0) || 0,
        latency_ms: gatewaySteps.reduce((sum, s) => sum + s.duration, 0),
      });

      for (let i = 0; i < gatewaySteps.length; i++) {
        setCurrentStepIndex(i);
        onHighlightNode(gatewaySteps[i].nodeId);
        await new Promise((r) => setTimeout(r, 300));
      }

      // Phase 9: Track test count for feedback
      if (data.execution_id) setExecutionIds(prev => [...prev, data.execution_id]);
      setTestCount(prev => {
        const next = prev + 1;
        if (next >= 5 && !feedbackDismissed) setShowFeedback(true);
        return next;
      });
    } catch (err) {
      const msg = (err as Error).message || "Erro desconhecido";
      let userMsg = msg;
      if (msg.includes("MODEL_NOT_CONFIGURED") || msg.includes("Configure o modelo")) {
        userMsg = "Modelo LLM não configurado. Abra as propriedades do nó e selecione um modelo.";
      } else if (msg.includes("Chave de API")) {
        userMsg = msg; // already humanized from gateway
      } else if (msg.includes("No trigger node") || msg.includes("no nodes")) {
        userMsg = "O flow precisa ter pelo menos um nó Trigger. Adicione um antes de testar.";
      } else if (msg.includes("rate") || msg.includes("429") || msg.includes("Too Many")) {
        userMsg = "Limite de requisições atingido. Aguarde alguns segundos.";
        setRateLimitCountdown(30);
      } else if (msg.includes("500") || msg.includes("internal")) {
        userMsg = "Erro interno no gateway. Verifique a configuração do modelo LLM e as API keys.";
      } else if (msg.includes("timeout") || msg.includes("TIMEOUT")) {
        userMsg = "Gateway não respondeu em tempo. Tente novamente.";
      }
      setGatewayError(userMsg);
      setSteps([{
        nodeId: "error", nodeType: "error", nodeLabel: "Gateway Error",
        status: "error", input: testMessage, output: userMsg, duration: 0, timestamp: Date.now(),
      }]);
    }

    onHighlightNode(null);
    setIsRunning(false);
  }, [testMessage, flowId, sessionId, onHighlightNode]);

  // Build execution order from flow graph (BFS from trigger)
  const getExecutionOrder = useCallback((): Node[] => {
    const triggerNodes = nodes.filter((n) => n.type === "trigger");
    if (triggerNodes.length === 0) return [];
    const visited = new Set<string>();
    const order: Node[] = [];
    const queue = [...triggerNodes];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      order.push(current);
      const outEdges = edges.filter((e) => e.source === current.id);
      for (const edge of outEdges) {
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (targetNode && !visited.has(targetNode.id)) queue.push(targetNode);
      }
    }
    return order;
  }, [nodes, edges]);

  // Local simulation output (clearly marked as fake)
  const getSimulatedOutput = (nodeType: string, input: string): string => {
    const mocks: Record<string, string> = {
      trigger: JSON.stringify({ message: input, channel: "web", session_id: "sim_local" }),
      llm: `[SIMULADO] Resposta local para: "${input.substring(0, 30)}..."`,
      tool: JSON.stringify({ status: "simulated", result: "dados_simulados" }),
      condition: JSON.stringify({ evaluated: true, branch: "true" }),
      output_guard: `[SIMULADO] ${input.substring(0, 50)}`,
      stt: JSON.stringify({ text: "[SIMULADO] Transcrição", confidence: 0 }),
      tts: JSON.stringify({ audio_url: "simulado", duration: 0 }),
      rag_search: JSON.stringify({ chunks: ["[SIMULADO] Chunk de exemplo"], sources: [] }),
      memory: JSON.stringify({ key: "test", value: "simulado", operation: "read" }),
      hitl: JSON.stringify({ status: "simulated", approver: "local" }),
    };
    return mocks[nodeType] || JSON.stringify({ output: "simulado" });
  };

  // Run local simulation
  const runLocalSimulation = useCallback(async () => {
    if (!testMessage.trim()) return;
    const executionOrder = getExecutionOrder();
    if (executionOrder.length === 0) return;

    setIsRunning(true);
    setSteps([]);
    setCurrentStepIndex(-1);
    setGatewayError(null);
    setMetrics(null);
    let currentInput = testMessage;

    for (let i = 0; i < executionOrder.length; i++) {
      const node = executionOrder[i];
      const nodeLabel = (node.data as Record<string, unknown>)?.label as string || node.type || "unknown";
      setCurrentStepIndex(i);
      onHighlightNode(node.id);

      const step: ExecutionStep = {
        nodeId: node.id, nodeType: node.type || "unknown", nodeLabel,
        status: "running", input: currentInput.substring(0, 100), output: "", duration: 0, timestamp: Date.now(),
      };
      setSteps((prev) => [...prev, step]);

      const delay = Math.random() * 600 + 200;
      await new Promise((r) => setTimeout(r, delay));
      const output = getSimulatedOutput(node.type || "", currentInput);

      setSteps((prev) =>
        prev.map((s, idx) => idx === i ? { ...s, status: "completed", output, duration: Math.round(delay) } : s)
      );
      currentInput = output;
    }

    onHighlightNode(null);
    setIsRunning(false);
  }, [testMessage, getExecutionOrder, onHighlightNode]);

  const stopExecution = useCallback(() => { setIsRunning(false); onHighlightNode(null); }, [onHighlightNode]);
  const resetExecution = useCallback(() => { setSteps([]); setCurrentStepIndex(-1); setIsRunning(false); setGatewayError(null); setMetrics(null); onHighlightNode(null); }, [onHighlightNode]);

  const handleRun = useCallback(() => {
    if (useGateway && flowId) {
      runViaGateway();
    } else {
      runLocalSimulation();
    }
  }, [useGateway, flowId, runViaGateway, runLocalSimulation]);

  const StatusIcon = ({ status }: { status: ExecutionStep["status"] }) => {
    switch (status) {
      case "running": return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "error": return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "skipped": return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0);
  const isGatewayMode = useGateway && !!flowId;

  return (
    <div className="w-80 border-l bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold">Teste</span>
          <Badge variant={isGatewayMode ? "default" : "outline"} className="text-[9px] px-1.5 py-0">
            {isGatewayMode ? "🟢 Gateway Real" : "🟡 Simulação Local"}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Mode toggle */}
      {flowId && (
        <div className="px-3 py-2 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            {isGatewayMode ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
            <Label className="text-[10px]">{isGatewayMode ? "Gateway real" : "Simulação local"}</Label>
          </div>
          <Switch checked={useGateway} onCheckedChange={setUseGateway} disabled={isRunning} />
        </div>
      )}

      {/* Simulation warning banner */}
      {!isGatewayMode && (
        <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-700 dark:text-amber-300">
            Simulação local — resultados não refletem o comportamento real do agente.
          </span>
        </div>
      )}

      {/* Gateway error banner */}
      {gatewayError && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/30 border-b shrink-0">
          <p className="text-[10px] text-red-700 dark:text-red-300">{gatewayError}</p>
          {isGatewayMode && (
            <button
              className="text-[10px] underline text-red-600 dark:text-red-400 mt-0.5"
              onClick={() => { setUseGateway(false); setGatewayError(null); }}
            >
              Usar simulação local →
            </button>
          )}
        </div>
      )}

      {/* Phase 9: Rate limit countdown */}
      {rateLimitCountdown > 0 && (
        <div className="px-3 py-1.5 bg-muted border-b flex items-center gap-2 shrink-0">
          <Timer className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            Aguarde {rateLimitCountdown}s para enviar novamente
          </span>
          <Progress value={((30 - rateLimitCountdown) / 30) * 100} className="h-1 flex-1" />
        </div>
      )}

      {/* Phase 9: Feedback prompt after 5+ tests */}
      {showFeedback && !feedbackDismissed && !isRunning && (
        <TestFeedbackPrompt
          executionIds={executionIds}
          onDismiss={() => { setShowFeedback(false); setFeedbackDismissed(true); }}
        />
      )}

      {/* Input */}
      <div className="p-3 border-b space-y-2 shrink-0">
        <div className="flex gap-2">
          <Input
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            placeholder="Mensagem de teste..."
            className="h-8 text-xs flex-1"
            disabled={isRunning}
            onKeyDown={(e) => e.key === "Enter" && !isRunning && handleRun()}
          />
          {isRunning ? (
            <Button size="icon" variant="destructive" className="h-8 w-8 shrink-0" onClick={stopExecution}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleRun} disabled={!testMessage.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {/* Phase 9: Timeout progress bar */}
        {isRunning && elapsedMs > 5000 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Timer className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">
                {Math.round(elapsedMs / 1000)}s{elapsedMs > 15000 ? " — processando nós complexos..." : ""}
              </span>
            </div>
            <Progress value={Math.min((elapsedMs / estimatedMs) * 100, 95)} className="h-1" />
          </div>
        )}
        {steps.length > 0 && (
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-[10px]">
              {steps.filter((s) => s.status === "completed").length}/{steps.length} nós
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{totalDuration}ms</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetExecution}>
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Metrics from gateway */}
        {metrics && isGatewayMode && (
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            <span>🎯 {metrics.tokens_in + metrics.tokens_out} tokens</span>
            <span>⏱ {metrics.latency_ms}ms</span>
            {metrics.cost_cents > 0 && <span>💰 ${(metrics.cost_cents / 100).toFixed(4)}</span>}
          </div>
        )}
      </div>

      {/* Execution Steps */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {steps.length === 0 && !isRunning && (
            <div className="text-center py-8 text-muted-foreground">
              <Play className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">
                {isGatewayMode
                  ? "Envie uma mensagem para testar o agente via gateway"
                  : "Envie uma mensagem para simular a execução do flow"}
              </p>
              {isGatewayMode && (
                <p className="text-[10px] mt-1 text-muted-foreground/60">
                  Sem necessidade de deploy — teste direto com flow_id
                </p>
              )}
            </div>
          )}

          {steps.map((step, i) => (
            <div
              key={`${step.nodeId}-${i}`}
              className={`rounded-lg border p-2.5 transition-all cursor-pointer hover:bg-muted/50 ${
                currentStepIndex === i && isRunning ? "ring-2 ring-blue-500/50 border-blue-500" : ""
              }`}
              onClick={() => onHighlightNode(step.nodeId)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <StatusIcon status={step.status} />
                  <span className="text-xs font-medium">{step.nodeType}</span>
                </div>
                {step.duration > 0 && (
                  <span className="text-[10px] text-muted-foreground">{step.duration}ms</span>
                )}
              </div>

              <div className="mb-1">
                <span className="text-[10px] text-muted-foreground font-medium">IN:</span>
                <p className="text-[10px] text-muted-foreground truncate ml-1 inline">
                  {step.input.substring(0, 60)}{step.input.length > 60 ? "..." : ""}
                </p>
              </div>

              {step.output && (
                <div>
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">OUT:</span>
                  <p className="text-[10px] text-foreground/80 break-all ml-1 inline font-mono">
                    {step.output.substring(0, 80)}{step.output.length > 80 ? "..." : ""}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
