import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function ErrorHandlerNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode selected={selected} icon={getNodeIconSource("error_handler")} label="Error Handler" subtitle={`retry: ${config.retry_count ?? 3} · ${config.fallback || "log+skip"}`} />;
}
