import { type NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function ErrorHandlerNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="error_handler"
      selected={selected}
      icon={<AlertTriangle className="h-3 w-3" />}
      label="Error Handler"
      subtitle={`retry: ${config.retry_count ?? 3} · ${config.fallback || "log+skip"}`}
    />
  );
}
