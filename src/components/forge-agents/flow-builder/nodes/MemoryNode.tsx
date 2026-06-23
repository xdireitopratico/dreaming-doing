import { type NodeProps } from "@/types/xyflow-react-shim";
import { Brain } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function MemoryNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="memory"
      selected={selected}
      icon={<Brain className="h-3 w-3" />}
      label="Memória"
      subtitle={`${config.operation || "read"} · ${config.key || "—"}`}
    />
  );
}
