import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";

export function STTNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return <BaseNode selected={selected} icon={getNodeIconSource("stt")} label="STT" subtitle={`🎤 ${config.language || "pt-BR"}`} />;
}
