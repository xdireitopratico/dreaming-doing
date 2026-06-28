/**
 * NodePropertiesPanel — NDV-style tabbed panel (Settings | Input | Output)
 * FASE 5.1: Tabbed interface with config, execution data viewer, and metadata
 *
 * Abas:
 * - Settings: configuração específica do tipo de nó
 * - Input: dados recebidos na última execução (do DB ou props)
 * - Output: dados produzidos na última execução
 */
import { useState, useEffect, useCallback } from "react";
import { type Node } from "@/types/xyflow-react-shim";
import {
  X, Bot, Zap, Wrench, GitBranch, Shield, Mic, Volume2, Search, Brain,
  Clock, ArrowRightLeft, Package, Settings, AlertTriangle, Users, Eye, Trash2,
  Database, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { ExecutionDataViewer } from "./ExecutionDataViewer";
import { toast } from "@/lib/toast";

import { LLMConfig } from "./node-properties/LLMConfig";
import { ToolConfig } from "./node-properties/ToolConfig";
import { VisionConfig } from "./node-properties/VisionConfig";
import { ConditionConfig, SwitchConfig, OutputGuardConfig } from "./node-properties/BranchConfigs";
import { STTConfig, TTSConfig } from "./node-properties/AudioConfigs";
import { RAGConfig, MemoryConfig, TransformerConfig } from "./node-properties/DataConfigs";
import { TriggerConfig, LoopConfig, DelayConfig, SubFlowConfig, ErrorHandlerConfig, HITLConfig } from "./node-properties/ControlConfigs";

type TabId = "settings" | "input" | "output";

const NODE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  trigger: { label: "Trigger", color: "bg-emerald-500", icon: <Zap className="h-4 w-4" /> },
  llm: { label: "LLM", color: "bg-blue-500", icon: <Bot className="h-4 w-4" /> },
  tool: { label: "Tool", color: "bg-yellow-500", icon: <Wrench className="h-4 w-4" /> },
  condition: { label: "Condição", color: "bg-gray-500", icon: <GitBranch className="h-4 w-4" /> },
  output_guard: { label: "Output Guard", color: "bg-amber-500", icon: <Shield className="h-4 w-4" /> },
  stt: { label: "STT", color: "bg-purple-500", icon: <Mic className="h-4 w-4" /> },
  tts: { label: "TTS", color: "bg-orange-500", icon: <Volume2 className="h-4 w-4" /> },
  rag_search: { label: "RAG Search", color: "bg-amber-700", icon: <Search className="h-4 w-4" /> },
  memory: { label: "Memória", color: "bg-pink-500", icon: <Brain className="h-4 w-4" /> },
  hitl: { label: "Aprovação", color: "bg-red-500", icon: <Users className="h-4 w-4" /> },
  loop: { label: "Loop", color: "bg-slate-500", icon: <ArrowRightLeft className="h-4 w-4" /> },
  sub_flow: { label: "Sub-Flow", color: "bg-gray-800", icon: <Package className="h-4 w-4" /> },
  delay: { label: "Delay", color: "bg-gray-400", icon: <Clock className="h-4 w-4" /> },
  error_handler: { label: "Error Handler", color: "bg-red-600", icon: <AlertTriangle className="h-4 w-4" /> },
  switch: { label: "Switch", color: "bg-indigo-500", icon: <GitBranch className="h-4 w-4" /> },
  transformer: { label: "Transformer", color: "bg-cyan-500", icon: <Settings className="h-4 w-4" /> },
  vision: { label: "Vision", color: "bg-violet-600", icon: <Eye className="h-4 w-4" /> },
};

const CONFIG_MAP: Record<string, React.ComponentType<{ config: Record<string, unknown>; updateConfig: (k: string, v: unknown) => void }>> = {
  trigger: TriggerConfig, llm: LLMConfig, tool: ToolConfig,
  condition: ConditionConfig, output_guard: OutputGuardConfig,
  stt: STTConfig, tts: TTSConfig, rag_search: RAGConfig,
  memory: MemoryConfig, hitl: HITLConfig, loop: LoopConfig,
  sub_flow: SubFlowConfig, delay: DelayConfig,
  error_handler: ErrorHandlerConfig, switch: SwitchConfig,
  transformer: TransformerConfig, vision: VisionConfig,
};

interface ExecutionStepData {
  input_data: unknown;
  output_data: unknown;
  status: string | null;
  started_at: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
}

interface NodePropertiesPanelProps {
  flowId: string;
  node: Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodePropertiesPanel({ flowId, node, onUpdate, onDelete, onClose }: NodePropertiesPanelProps) {
  const [tab, setTab] = useState<TabId>("settings");
  const [execData, setExecData] = useState<ExecutionStepData | null>(null);
  const [loadingExec, setLoadingExec] = useState(false);

  if (!node) return null;

  const meta = NODE_META[node.type || ""] || { label: "Nó", color: "bg-muted", icon: null };
  const config = ((node.data as Record<string, unknown>)?.config as Record<string, unknown>) || {};
  const ConfigComponent = CONFIG_MAP[node.type || ""];

  const updateConfig = (key: string, value: unknown) => {
    onUpdate(node.id, {
      ...(node.data as Record<string, unknown>),
      config: { ...config, [key]: value },
    });
  };

  /* ── Load last execution data for this node ── */
  const loadExecutionData = useCallback(async () => {
    if (!flowId) return;
    setLoadingExec(true);
    try {
      const { data, error } = await supabase
        .from("agent_execution_steps")
        .select("input_data, output_data, status, started_at, latency_ms, tokens_in, tokens_out")
        .eq("node_id", node.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setExecData(data as ExecutionStepData | null);
    } catch (err) {
      // Silently fail — execution data is optional
      setExecData(null);
    }
    setLoadingExec(false);
  }, [flowId, node.id]);

  useEffect(() => {
    if (tab === "input" || tab === "output") {
      loadExecutionData();
    }
  }, [tab, loadExecutionData]);

  /* ── Tabs ── */
  const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "settings", label: "Settings", icon: <Settings className="h-3.5 w-3.5" /> },
    { id: "input", label: "Input", icon: <Database className="h-3.5 w-3.5" /> },
    { id: "output", label: "Output", icon: <Play className="h-3.5 w-3.5" /> },
  ];

  return (
    <div
      className="w-80 overflow-y-auto shrink-0 flex flex-col"
      style={{ background: 'var(--ps-bg)', borderLeft: '1px solid var(--ps-border)', color: 'var(--ps-cream)' }}
    >
      {/* ── Header ── */}
      <div className="p-3 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--ps-border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`${meta.color} text-white p-1.5 rounded shrink-0`}>{meta.icon}</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--ps-cream)' }}>{meta.label}</div>
            <div className="text-[9px] font-mono truncate" style={{ color: 'var(--ps-cream-25)' }}>{node.id.slice(0, 16)}…</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-500/20" onClick={() => onDelete(node.id)} style={{ color: '#ef4444' }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" style={{ background: 'var(--ps-bg)', color: 'var(--ps-cream)', border: '1px solid var(--ps-border)' }}>
                <p className="text-xs">Excluir nó (Delete)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} style={{ color: 'var(--ps-cream-40)' }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--ps-border)' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium transition-all relative"
            style={{
              color: tab === t.id ? 'var(--ps-accent)' : 'var(--ps-cream-40)',
              background: tab === t.id ? 'rgba(245,158,11,0.08)' : 'transparent',
            }}
          >
            {t.icon}
            {t.label}
            {tab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--ps-accent)' }} />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {tab === "settings" && (
          <div className="p-4 space-y-4">
            <div>
              <Label className="text-xs" style={{ color: 'var(--ps-cream-60)' }}>ID do Nó</Label>
              <Input value={node.id} disabled className="h-8 text-xs mt-1 border-none" style={{ background: 'var(--ps-bg-surface)', color: 'var(--ps-cream-40)' }} />
            </div>
            {node.type === "tool" ? (
              <ToolConfig config={config} updateConfig={updateConfig} flowId={flowId} />
            ) : (
              ConfigComponent && <ConfigComponent config={config} updateConfig={updateConfig} />
            )}
          </div>
        )}

        {tab === "input" && (
          <div className="p-3 space-y-3">
            {loadingExec ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ps-accent)', borderTopColor: 'transparent' }} />
              </div>
            ) : execData?.input_data != null ? (
              <>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--ps-cream-25)' }}>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal" style={{ borderColor: 'var(--ps-border)' }}>
                    {execData.status}
                  </Badge>
                  {execData.latency_ms != null && <span>{execData.latency_ms}ms</span>}
                  {execData.started_at && (
                    <span>{new Date(execData.started_at).toLocaleTimeString("pt-BR")}</span>
                  )}
                </div>
                <ExecutionDataViewer
                  data={execData.input_data}
                  label="Dados recebidos"
                  maxHeight="60vh"
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Database className="h-8 w-8" style={{ color: 'var(--ps-cream-25)' }} />
                <p className="text-[11px]" style={{ color: 'var(--ps-cream-40)' }}>
                  Execute o fluxo para ver os dados de entrada deste nó
                </p>
                <p className="text-[9px]" style={{ color: 'var(--ps-cream-25)' }}>
                  Os dados aparecerão aqui após a primeira execução
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "output" && (
          <div className="p-3 space-y-3">
            {loadingExec ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ps-accent)', borderTopColor: 'transparent' }} />
              </div>
            ) : execData?.output_data != null ? (
              <>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--ps-cream-25)' }}>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal" style={{ borderColor: 'var(--ps-border)' }}>
                    {execData.status}
                  </Badge>
                  {execData.latency_ms != null && <span>{execData.latency_ms}ms</span>}
                  {(execData.tokens_in || execData.tokens_out) && (
                    <span>📊 {execData.tokens_in || 0}→{execData.tokens_out || 0} tok</span>
                  )}
                </div>
                <ExecutionDataViewer
                  data={execData.output_data}
                  label="Dados produzidos"
                  maxHeight="60vh"
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Play className="h-8 w-8" style={{ color: 'var(--ps-cream-25)' }} />
                <p className="text-[11px]" style={{ color: 'var(--ps-cream-40)' }}>
                  Execute o fluxo para ver os dados de saída deste nó
                </p>
                <p className="text-[9px]" style={{ color: 'var(--ps-cream-25)' }}>
                  Os dados aparecerão aqui após a primeira execução
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
