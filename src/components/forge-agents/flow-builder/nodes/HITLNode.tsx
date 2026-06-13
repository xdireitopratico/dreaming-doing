import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Users } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function HITLNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="hitl"
      selected={selected}
      icon={<Users className="h-3 w-3" />}
      label="Aprovação"
      subtitle={`timeout: ${config.timeout_minutes ?? 60}min`}
      showSource={false}
    >
      <div className="flex justify-between px-3 pb-1.5 text-[9px]">
        <span className="text-emerald-500 font-medium">✓ aprovado</span>
        <span className="text-red-500 font-medium">✗ rejeitado</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="approved" className="!bg-emerald-500 !w-2.5 !h-2.5 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="rejected" className="!bg-red-500 !w-2.5 !h-2.5 !left-[70%]" />
    </BaseNode>
  );
}
