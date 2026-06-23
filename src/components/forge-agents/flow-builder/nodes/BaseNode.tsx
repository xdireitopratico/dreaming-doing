/**
 * BaseNode — Compact pill-style node wrapper (n8n-inspired)
 * All 17 node types use this for consistent, minimal canvas representation.
 * Layers: Visual (compact pill) → title tooltip (hover) → Properties panel (click)
 */
import { Handle, Position } from "@/types/xyflow-react-shim";

const COLORS: Record<string, {
  bg: string; border: string; borderActive: string; ring: string; handle: string;
}> = {
  trigger:       { bg: "bg-emerald-500", border: "border-emerald-500/50", borderActive: "border-emerald-500", ring: "ring-emerald-500/20", handle: "!bg-emerald-500" },
  llm:           { bg: "bg-blue-500",    border: "border-blue-500/50",    borderActive: "border-blue-500",    ring: "ring-blue-500/20",    handle: "!bg-blue-500" },
  tool:          { bg: "bg-yellow-500",  border: "border-yellow-500/50",  borderActive: "border-yellow-500",  ring: "ring-yellow-500/20",  handle: "!bg-yellow-500" },
  condition:     { bg: "bg-gray-500",    border: "border-gray-500/50",    borderActive: "border-gray-500",    ring: "ring-gray-500/20",    handle: "!bg-gray-500" },
  output_guard:  { bg: "bg-amber-500",   border: "border-amber-500/50",   borderActive: "border-amber-500",   ring: "ring-amber-500/20",   handle: "!bg-amber-500" },
  stt:           { bg: "bg-purple-500",  border: "border-purple-500/50",  borderActive: "border-purple-500",  ring: "ring-purple-500/20",  handle: "!bg-purple-500" },
  tts:           { bg: "bg-orange-500",  border: "border-orange-500/50",  borderActive: "border-orange-500",  ring: "ring-orange-500/20",  handle: "!bg-orange-500" },
  rag_search:    { bg: "bg-amber-700",   border: "border-amber-700/50",   borderActive: "border-amber-700",   ring: "ring-amber-700/20",   handle: "!bg-amber-700" },
  memory:        { bg: "bg-pink-500",    border: "border-pink-500/50",    borderActive: "border-pink-500",    ring: "ring-pink-500/20",    handle: "!bg-pink-500" },
  hitl:          { bg: "bg-red-500",     border: "border-red-500/50",     borderActive: "border-red-500",     ring: "ring-red-500/20",     handle: "!bg-red-500" },
  loop:          { bg: "bg-slate-500",   border: "border-slate-500/50",   borderActive: "border-slate-500",   ring: "ring-slate-500/20",   handle: "!bg-slate-500" },
  sub_flow:      { bg: "bg-gray-800",    border: "border-gray-800/50",    borderActive: "border-gray-800",    ring: "ring-gray-800/20",    handle: "!bg-gray-800" },
  delay:         { bg: "bg-gray-400",    border: "border-gray-400/50",    borderActive: "border-gray-400",    ring: "ring-gray-400/20",    handle: "!bg-gray-400" },
  error_handler: { bg: "bg-red-600",     border: "border-red-600/50",     borderActive: "border-red-600",     ring: "ring-red-600/20",     handle: "!bg-red-600" },
  switch:        { bg: "bg-indigo-500",  border: "border-indigo-500/50",  borderActive: "border-indigo-500",  ring: "ring-indigo-500/20",  handle: "!bg-indigo-500" },
  transformer:   { bg: "bg-cyan-500",    border: "border-cyan-500/50",    borderActive: "border-cyan-500",    ring: "ring-cyan-500/20",    handle: "!bg-cyan-500" },
  vision:        { bg: "bg-violet-600",  border: "border-violet-600/50",  borderActive: "border-violet-600",  ring: "ring-violet-600/20",  handle: "!bg-violet-600" },
};

export { COLORS as NODE_COLORS };

interface BaseNodeProps {
  nodeType: string;
  selected: boolean;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  badge?: React.ReactNode;
  showTarget?: boolean;
  showSource?: boolean;
  children?: React.ReactNode;
}

export function BaseNode({
  nodeType, selected, icon, label, subtitle, badge,
  showTarget = true, showSource = true, children,
}: BaseNodeProps) {
  const c = COLORS[nodeType] || COLORS.trigger;

  return (
    <div
      className={`min-w-[120px] max-w-[200px] rounded-lg border shadow-sm transition-all hover:shadow-md ${
        selected ? `${c.borderActive} ring-2 ${c.ring}` : c.border
      }`}
      style={{ background: 'var(--ps-bg, hsl(225 30% 6%))' }}
      title={subtitle || label}
    >
      {showTarget && (
        <Handle type="target" position={Position.Top} className={`${c.handle} !w-2.5 !h-2.5`} />
      )}

      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className={`${c.bg} text-white p-1 rounded shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium truncate leading-tight" style={{ color: 'var(--ps-cream, #f0e6d7)' }}>{label}</span>
            {badge}
          </div>
          {subtitle && (
            <div className="text-[9px] truncate leading-tight mt-0.5" style={{ color: 'var(--ps-cream-40, rgba(240,230,215,0.4))' }}>{subtitle}</div>
          )}
        </div>
      </div>

      {children}

      {showSource && (
        <Handle type="source" position={Position.Bottom} className={`${c.handle} !w-2.5 !h-2.5`} />
      )}
    </div>
  );
}
