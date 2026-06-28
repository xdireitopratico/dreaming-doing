import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function DelayNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode id={id} cardType="configuration" iconContext="configuration" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("delay")} label="Delay" subtitle={`${config.seconds ?? 5}s`} />;
}
