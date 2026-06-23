import { type NodeProps } from "@/types/xyflow-react-shim";
import { Package } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function SubFlowNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="sub_flow"
      selected={selected}
      icon={<Package className="h-3 w-3" />}
      label="Sub-Flow"
      subtitle={config.flow_name || "Selecionar..."}
    />
  );
}
