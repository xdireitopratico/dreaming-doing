import { type NodeProps } from "@/types/xyflow-react-shim";
import { ArrowRightLeft } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function LoopNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="loop"
      selected={selected}
      icon={<ArrowRightLeft className="h-3 w-3" />}
      label="Loop"
      subtitle={`max: ${config.max_iterations ?? 10} iterações`}
    />
  );
}
