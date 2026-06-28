import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function SubFlowNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("sub_flow")} label="Sub-Flow" subtitle={config.flow_name || "Selecionar..."} />;
}
