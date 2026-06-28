import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function TriggerNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const channel = config.channel || "web";
  const cron = config.cron_expression;
  return (
    <BaseNode id={id} cardType="trigger" selected={selected} icon={getNodeIconSource("trigger")}
      label="Trigger" subtitle={cron ? `${channel} · ⏱ ${cron}` : channel} showTarget={false}
      status={resolveNodeStatus(data)} />
  );
}
