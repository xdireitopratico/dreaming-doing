import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function TTSNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode id={id} cardType="configuration" iconContext="configuration" selected={selected} status={resolveNodeStatus(data)} icon={getNodeIconSource("tts")} label="TTS" subtitle={`🔊 ${config.voice || "default"}`} />;
}
