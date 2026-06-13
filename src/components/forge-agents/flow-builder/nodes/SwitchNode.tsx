import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function SwitchNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const cases = config.cases || ["case_1", "case_2", "default"];

  return (
    <BaseNode
      nodeType="switch"
      selected={selected}
      icon={<GitBranch className="h-3 w-3" />}
      label="Switch"
      subtitle={`${cases.length} caso(s)`}
      showSource={false}
    >
      <div className="px-2.5 pb-1.5 flex flex-wrap gap-0.5">
        {cases.map((c: string) => (
          <span key={c} className="text-[8px] px-1 py-0.5 rounded" style={{ background: 'var(--ps-bg-surface-hover, rgba(255,255,255,0.05))', color: 'var(--ps-cream-80)' }}>{c}</span>
        ))}
      </div>
      {cases.map((c: string, i: number) => (
        <Handle
          key={c}
          type="source"
          position={Position.Bottom}
          id={c}
          className="!bg-indigo-500 !w-2.5 !h-2.5"
          style={{ left: `${((i + 1) / (cases.length + 1)) * 100}%` }}
        />
      ))}
    </BaseNode>
  );
}
