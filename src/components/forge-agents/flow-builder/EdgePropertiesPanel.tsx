/**
 * EdgePropertiesPanel — Configuração de condições e labels nas conexões
 */
import { useState, useEffect } from "react";
import { type Edge } from "@/types/xyflow-react-shim";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  X,
  ArrowRight,
  Tag,
  Code,
  Palette,
} from "lucide-react";

const EDGE_TYPES = [
  { value: "default", label: "Padrão", color: "hsl(var(--primary))" },
  { value: "true", label: "Verdadeiro", color: "#22c55e" },
  { value: "false", label: "Falso", color: "#ef4444" },
  { value: "error", label: "Erro", color: "#dc2626" },
  { value: "timeout", label: "Timeout", color: "#f59e0b" },
  { value: "fallback", label: "Fallback", color: "#6b7280" },
  { value: "case_1", label: "Caso 1", color: "#3b82f6" },
  { value: "case_2", label: "Caso 2", color: "#8b5cf6" },
  { value: "case_3", label: "Caso 3", color: "#06b6d4" },
  { value: "case_default", label: "Default", color: "#6b7280" },
];

const CONDITION_TEMPLATES = [
  { label: "Output contém", expr: "output.text.includes('VALUE')" },
  { label: "Score maior que", expr: "output.confidence > 0.8" },
  { label: "Status igual", expr: "output.status === 'success'" },
  { label: "Array não vazio", expr: "output.results.length > 0" },
  { label: "Campo existe", expr: "output.data !== undefined" },
  { label: "Sentimento positivo", expr: "output.sentiment > 0.5" },
];

interface EdgePropertiesPanelProps {
  edge: Edge;
  sourceNodeLabel: string;
  targetNodeLabel: string;
  onUpdate: (edgeId: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}

export function EdgePropertiesPanel({
  edge,
  sourceNodeLabel,
  targetNodeLabel,
  onUpdate,
  onClose,
}: EdgePropertiesPanelProps) {
  const edgeData = (edge.data || {}) as Record<string, any>;
  const [label, setLabel] = useState(edgeData.label || "");
  const [condition, setCondition] = useState(edgeData.condition || "");
  const [edgeType, setEdgeType] = useState(edgeData.edge_type || "default");
  const [priority, setPriority] = useState<number>(edgeData.priority || 0);

  useEffect(() => {
    const d = (edge.data || {}) as Record<string, any>;
    setLabel(d.label || "");
    setCondition(d.condition || "");
    setEdgeType(d.edge_type || "default");
    setPriority(d.priority || 0);
  }, [edge.id]);

  const handleSave = () => {
    onUpdate(edge.id, {
      ...edgeData,
      label,
      condition,
      edge_type: edgeType,
      priority,
    });
  };

  // Auto-save on change
  useEffect(() => {
    const timer = setTimeout(handleSave, 300);
    return () => clearTimeout(timer);
  }, [label, condition, edgeType, priority]);

  return (
    <div className="w-[320px] flex flex-col shrink-0 overflow-hidden" style={{ background: 'var(--ps-bg)', borderLeft: '1px solid var(--ps-border)', color: 'var(--ps-cream)' }}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--ps-border)' }}>
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4" style={{ color: 'var(--ps-accent)' }} />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--ps-cream)' }}>Conexão</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} style={{ color: 'var(--ps-cream-40)' }}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Connection info */}
        <div className="flex items-center gap-2 p-2 rounded text-xs" style={{ background: 'var(--ps-bg-surface)', border: '1px solid var(--ps-border)' }}>
          <Badge variant="outline" className="text-[10px] truncate max-w-[100px]" style={{ borderColor: 'var(--ps-border)', color: 'var(--ps-cream-80)' }}>{sourceNodeLabel}</Badge>
          <ArrowRight className="h-3 w-3 shrink-0" style={{ color: 'var(--ps-cream-40)' }} />
          <Badge variant="outline" className="text-[10px] truncate max-w-[100px]" style={{ borderColor: 'var(--ps-border)', color: 'var(--ps-cream-80)' }}>{targetNodeLabel}</Badge>
        </div>

        {/* Label */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--ps-cream-60)' }}>
            <Tag className="h-3 w-3" />
            Label
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ex: Sim, Não, Erro..."
            className="h-8 text-sm"
          />
        </div>

        {/* Edge Type / Color */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--ps-cream-60)' }}>
            <Palette className="h-3 w-3" />
            Tipo de rota
          </label>
          <div className="grid grid-cols-2 gap-1">
            {EDGE_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setEdgeType(t.value)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[11px] border transition-colors ${
                  edgeType === t.value
                    ? "font-medium"
                    : ""
                }`}
                style={{
                  borderColor: edgeType === t.value ? 'var(--ps-border-accent)' : 'transparent',
                  background: edgeType === t.value ? 'var(--ps-accent-subtle)' : undefined,
                  color: 'var(--ps-cream-80)',
                }}
              >
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Condition Expression */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--ps-cream-60)' }}>
            <Code className="h-3 w-3" />
            Condição (expressão)
          </label>
          <Textarea
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="ex: output.status === 'success'"
            className="text-sm font-mono min-h-[60px]"
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--ps-cream-25)' }}>
            Expressão JS avaliada no runtime. Acesse <code className="font-mono px-0.5 rounded" style={{ background: 'var(--ps-bg-surface-hover)' }}>output</code> do nó de origem.
          </p>
        </div>

        {/* Condition Templates */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ps-cream-60)' }}>Templates de condição</label>
          <div className="flex flex-wrap gap-1">
            {CONDITION_TEMPLATES.map((t) => (
              <Badge
                key={t.expr}
                variant="outline"
                className="text-[10px] cursor-pointer"
                style={{ borderColor: 'var(--ps-border)', color: 'var(--ps-cream-60)' }}
                onClick={() => setCondition(t.expr)}
              >
                {t.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ps-cream-60)' }}>Prioridade</label>
          <Input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
            className="h-8 text-sm w-20"
            min={0}
            max={99}
          />
          <p className="text-[10px] mt-1" style={{ color: 'var(--ps-cream-25)' }}>
            Edges com maior prioridade são avaliados primeiro (0 = default).
          </p>
        </div>

        {/* Preview */}
        <div className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--ps-border)', background: 'var(--ps-bg-surface)' }}>
          <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--ps-cream-40)' }}>Preview</div>
          <div className="flex items-center gap-2">
            <div
              className="h-1 flex-1 rounded"
              style={{ backgroundColor: EDGE_TYPES.find((t) => t.value === edgeType)?.color || "hsl(var(--primary))" }}
            />
          </div>
          <div className="text-[11px] space-y-0.5" style={{ color: 'var(--ps-cream-80)' }}>
            {label && <div><span style={{ color: 'var(--ps-cream-40)' }}>Label:</span> {label}</div>}
            {condition && <div><span style={{ color: 'var(--ps-cream-40)' }}>Condição:</span> <code className="font-mono text-[10px]">{condition}</code></div>}
            <div><span style={{ color: 'var(--ps-cream-40)' }}>Tipo:</span> {EDGE_TYPES.find((t) => t.value === edgeType)?.label}</div>
            {priority > 0 && <div><span style={{ color: 'var(--ps-cream-40)' }}>Prioridade:</span> {priority}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
