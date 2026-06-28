import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function STTNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode cardType="configuration" iconContext="configuration" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("stt")} label="STT" subtitle={`🎤 ${config.language || "pt-BR"}`} />;
}
