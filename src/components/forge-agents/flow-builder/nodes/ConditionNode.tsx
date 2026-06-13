import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function ConditionNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="condition"
      selected={selected}
      icon={<GitBranch className="h-3 w-3" />}
      label="Condição"
      subtitle={config.expression ? "✓ configurada" : "Definir..."}
      showSource={false}
    >
      <div className="flex justify-between px-3 pb-1.5 text-[9px]">
        <span className="text-emerald-500 font-medium">✓ true</span>
        <span className="text-red-500 font-medium">✗ false</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-emerald-500 !w-2.5 !h-2.5 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-500 !w-2.5 !h-2.5 !left-[70%]" />
    </BaseNode>
  );
}
