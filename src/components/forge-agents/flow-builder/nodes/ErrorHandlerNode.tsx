import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function ErrorHandlerNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode id={id} cardType="configuration" iconContext="configuration" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("error_handler")} label="Error Handler" subtitle={`retry: ${config.retry_count ?? 3} · ${config.fallback || "log+skip"}`} />;
}
