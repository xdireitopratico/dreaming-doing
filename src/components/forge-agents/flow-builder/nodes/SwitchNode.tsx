import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function SwitchNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const cases = config.cases || ["case_1", "case_2", "default"];
  return (
    <BaseNode id={id} cardType="configuration" iconContext="configuration" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("switch")} label="Switch"
      subtitle={`${cases.length} caso(s)`} showSource={false}>
      <div className="absolute top-full mt-7 left-1/2 -translate-x-1/2 w-40 flex flex-wrap justify-center gap-0.5">
        {cases.map((c: string) => (
          <span key={c} className="text-[8px] px-1 py-0.5 rounded" style={{ background: 'var(--ps-bg-surface-hover, rgba(255,255,255,0.05))', color: 'var(--ps-cream-80)' }}>{c}</span>
        ))}
      </div>
      {cases.map((c: string, i: number) => (
        <Handle key={c} type="source" position={Position.Bottom} id={c}
          className="!bg-indigo-500 !w-3 !h-3 !border-2 !border-[#1a1a2e]"
          style={{ left: `${((i + 1) / (cases.length + 1)) * 100}%`, bottom: "-28px" }} />
      ))}
    </BaseNode>
  );
}
