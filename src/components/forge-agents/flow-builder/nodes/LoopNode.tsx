import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function LoopNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode cardType="configuration" iconContext="configuration" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("loop")} label="Loop" subtitle={`max: ${config.max_iterations ?? 10} iterações`} />;
}
