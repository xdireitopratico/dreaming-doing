import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function MemoryNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("memory")} label="Memória" subtitle={`${config.operation || "read"} · ${config.key || "—"}`} />;
}
