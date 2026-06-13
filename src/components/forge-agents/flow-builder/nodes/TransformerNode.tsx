import { type NodeProps } from "@xyflow/react";
import { Settings } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function TransformerNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const tmpl = config.template as string;
  return (
    <BaseNode
      nodeType="transformer"
      selected={selected}
      icon={<Settings className="h-3 w-3" />}
      label="Transformer"
      subtitle={tmpl ? tmpl.slice(0, 30) : "Definir template..."}
    />
  );
}
