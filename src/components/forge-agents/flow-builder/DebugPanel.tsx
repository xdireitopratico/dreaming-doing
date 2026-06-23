/**
 * DebugPanel — Orchestrator for debug sub-components
 * Decomposed from 609-line monolith (ROADMAP-02 Fase 2)
 */
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X, Bug, Play, SkipForward, StopCircle, Zap, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import type { Node, Edge } from "@/types/xyflow-react-shim";
import type { BreakpointInfo } from "./debug/debug-types";
import { useDebugExecution } from "./debug/useDebugExecution";
import { DebugBreakpoints } from "./debug/DebugBreakpoints";
import { DebugVariables } from "./debug/DebugVariables";
import { DebugConsole } from "./debug/DebugConsole";

interface DebugPanelProps {
  nodes: Node[];
  edges: Edge[];
  flowId?: string;
  onHighlightNode: (nodeId: string | null) => void;
  onClose: () => void;
}

export function DebugPanel({ nodes, edges, flowId, onHighlightNode, onClose }: DebugPanelProps) {
  const [breakpoints, setBreakpoints] = useState<Map<string, BreakpointInfo>>(new Map());
  const [tab, setTab] = useState<"breakpoints" | "variables" | "console">("breakpoints");
  const [inputMessage, setInputMessage] = useState("Olá, preciso de ajuda com meu contrato");

  const debug = useDebugExecution({ nodes, edges, breakpoints, onHighlightNode, flowId });

  const toggleBreakpoint = useCallback((node: Node) => {
    setBreakpoints((prev) => {
      const next = new Map(prev);
      if (next.has(node.id)) {
        next.delete(node.id);
      } else {
        next.set(node.id, {
          nodeId: node.id,
          nodeLabel: (node.data?.label as string) || node.id,
          nodeType: node.type || "unknown",
          enabled: true,
          hitCount: 0,
        });
      }
      return next;
    });
  }, []);

  const toggleBreakpointEnabled = useCallback((nodeId: string) => {
    setBreakpoints((prev) => {
      const next = new Map(prev);
      const bp = next.get(nodeId);
      if (bp) next.set(nodeId, { ...bp, enabled: !bp.enabled });
      return next;
    });
  }, []);

  const setBreakpointCondition = useCallback((nodeId: string, condition: string) => {
    setBreakpoints((prev) => {
      const next = new Map(prev);
      const bp = next.get(nodeId);
      if (bp) next.set(nodeId, { ...bp, condition });
      return next;
    });
  }, []);

  const stateLabel = debug.debugState === "idle" ? "Pronto"
    : debug.debugState === "running" ? "Executando"
    : debug.debugState === "paused" ? "Pausado"
    : debug.debugState === "completed" ? "Concluído" : "Erro";

  return (
    <div className="w-[420px] border-l bg-background flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Debug</span>
          <Badge variant="outline" className="text-[10px]">{stateLabel}</Badge>
          <Badge variant={debug.useGateway ? "default" : "outline"} className="text-[9px] px-1.5 py-0">
            {debug.useGateway ? "🟢 Gateway" : "🟡 Local"}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Gateway toggle */}
      {flowId && (
        <div className="px-3 py-1.5 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            {debug.useGateway ? <Wifi className="h-3.5 w-3.5 text-emerald-500" /> : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
            <Label className="text-[10px]">{debug.useGateway ? "Gateway real" : "Simulação local"}</Label>
          </div>
          <Switch checked={debug.useGateway} onCheckedChange={debug.setUseGateway} disabled={debug.debugState === "running"} />
        </div>
      )}

      {/* Simulation banner */}
      {!debug.useGateway && (
        <div className="px-3 py-1 bg-amber-50 dark:bg-amber-950/30 border-b flex items-center gap-1.5 shrink-0">
          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-700 dark:text-amber-300">Simulação local — dados não são reais.</span>
        </div>
      )}

      {/* Controls */}
      <div className="p-3 border-b flex items-center gap-2 shrink-0">
        {debug.debugState === "idle" || debug.debugState === "completed" || debug.debugState === "error" ? (
          <Button size="sm" className="gap-1 flex-1" onClick={() => debug.startDebug(inputMessage)}>
            <Play className="h-3.5 w-3.5" />
            Iniciar Debug
          </Button>
        ) : debug.debugState === "paused" ? (
          <>
            <Button size="sm" className="gap-1 flex-1" onClick={debug.resumeDebug}>
              <Play className="h-3.5 w-3.5" />
              Continuar
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={debug.resumeDebug}>
              <SkipForward className="h-3.5 w-3.5" />
              Step
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" className="gap-1 flex-1" disabled>
            <Zap className="h-3.5 w-3.5 animate-pulse" />
            Executando...
          </Button>
        )}
        {debug.debugState !== "idle" && (
          <Button size="sm" variant="destructive" className="gap-1" onClick={debug.stopDebug}>
            <StopCircle className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-b shrink-0">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Mensagem de Teste</label>
        <Input
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Mensagem do trigger..."
          className="mt-1 h-8 text-xs"
          disabled={debug.debugState === "running" || debug.debugState === "paused"}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0">
        {(["breakpoints", "variables", "console"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "breakpoints" ? `Breakpoints (${breakpoints.size})` : t === "variables" ? "Variáveis" : `Console (${debug.consoleLog.length})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {tab === "breakpoints" && (
            <DebugBreakpoints
              nodes={nodes}
              breakpoints={breakpoints}
              onToggle={toggleBreakpoint}
              onToggleEnabled={toggleBreakpointEnabled}
              onSetCondition={setBreakpointCondition}
              onClearAll={() => setBreakpoints(new Map())}
              onHighlightNode={onHighlightNode}
            />
          )}
          {tab === "variables" && (
            <DebugVariables
              currentStep={debug.currentStep}
              steps={debug.steps}
              currentStepIdx={debug.currentStepIdx}
              onHighlightNode={onHighlightNode}
            />
          )}
          {tab === "console" && (
            <DebugConsole entries={debug.consoleLog} onClear={() => debug.setConsoleLog([])} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
