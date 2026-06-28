import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function DelayNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode selected={selected} icon={getNodeIconSource("delay")} label="Delay" subtitle={`${config.seconds ?? 5}s`} />;
}
