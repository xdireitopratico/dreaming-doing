import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function TTSNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode selected={selected} icon={getNodeIconSource("tts")} label="TTS" subtitle={`🔊 ${config.voice || "default"}`} />;
}
