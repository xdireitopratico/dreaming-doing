import { type NodeProps } from "@/types/xyflow-react-shim";
import { Zap } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function TriggerNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const channel = config.channel || "web";
  const cron = config.cron_expression;

  return (
    <BaseNode
      nodeType="trigger"
      selected={selected}
      icon={<Zap className="h-3 w-3" />}
      label="Trigger"
      subtitle={cron ? `${channel} · ⏱ ${cron}` : channel}
      showTarget={false}
    />
  );
}
