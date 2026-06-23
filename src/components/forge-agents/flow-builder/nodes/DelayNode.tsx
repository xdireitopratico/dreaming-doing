import { type NodeProps } from "@/types/xyflow-react-shim";
import { Clock } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function DelayNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="delay"
      selected={selected}
      icon={<Clock className="h-3 w-3" />}
      label="Delay"
      subtitle={`${config.seconds ?? 5}s`}
    />
  );
}
