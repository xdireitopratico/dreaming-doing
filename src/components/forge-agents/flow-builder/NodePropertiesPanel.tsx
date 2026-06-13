/**
 * NodePropertiesPanel — Thin orchestrator for node config sub-components
 * Refactored: split from 454-line monolith into focused config modules
 */
import { type Node } from "@xyflow/react";
import { X, Bot, Zap, Wrench, GitBranch, Shield, Mic, Volume2, Search, Brain, Clock, ArrowRightLeft, Package, Settings, AlertTriangle, Users, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { LLMConfig } from "./node-properties/LLMConfig";
import { ToolConfig } from "./node-properties/ToolConfig";
import { VisionConfig } from "./node-properties/VisionConfig";
import { ConditionConfig, SwitchConfig, OutputGuardConfig } from "./node-properties/BranchConfigs";
import { STTConfig, TTSConfig } from "./node-properties/AudioConfigs";
import { RAGConfig, MemoryConfig, TransformerConfig } from "./node-properties/DataConfigs";
import { TriggerConfig, LoopConfig, DelayConfig, SubFlowConfig, ErrorHandlerConfig, HITLConfig } from "./node-properties/ControlConfigs";

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
  trigger: TriggerConfig,
  llm: LLMConfig,
  tool: ToolConfig,
  condition: ConditionConfig,
  output_guard: OutputGuardConfig,
  stt: STTConfig,
  tts: TTSConfig,
  rag_search: RAGConfig,
  memory: MemoryConfig,
  hitl: HITLConfig,
  loop: LoopConfig,
  sub_flow: SubFlowConfig,
  delay: DelayConfig,
  error_handler: ErrorHandlerConfig,
  switch: SwitchConfig,
  transformer: TransformerConfig,
  vision: VisionConfig,
};

interface NodePropertiesPanelProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodePropertiesPanel({ node, onUpdate, onDelete, onClose }: NodePropertiesPanelProps) {
  if (!node) return null;

  const meta = NODE_META[node.type || ""] || { label: "Nó", color: "bg-muted", icon: null };
  const config = ((node.data as Record<string, unknown>)?.config as Record<string, unknown>) || {};

  const updateConfig = (key: string, value: unknown) => {
    onUpdate(node.id, {
      ...(node.data as Record<string, unknown>),
      config: { ...config, [key]: value },
    });
  };

  const ConfigComponent = CONFIG_MAP[node.type || ""];

  return (
    <div className="w-80 overflow-y-auto shrink-0" style={{ background: 'var(--ps-bg)', borderLeft: '1px solid var(--ps-border)', color: 'var(--ps-cream)' }}>
      {/* Header */}
      <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--ps-border)' }}>
        <div className="flex items-center gap-2">
          <div className={`${meta.color} text-white p-1.5 rounded`}>{meta.icon}</div>
          <span className="text-sm font-semibold" style={{ color: 'var(--ps-cream)' }}>{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-500/20" onClick={() => onDelete(node.id)} style={{ color: 'var(--ps-red)' }}>
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

      {/* Config */}
      <div className="p-4 space-y-4">
        <div>
          <Label className="text-xs" style={{ color: 'var(--ps-cream-60)' }}>ID do Nó</Label>
          <Input value={node.id} disabled className="h-8 text-xs mt-1 border-none" style={{ background: 'var(--ps-bg-surface)', color: 'var(--ps-cream-40)' }} />
        </div>
        {ConfigComponent && <ConfigComponent config={config} updateConfig={updateConfig} />}
      </div>
    </div>
  );
}
