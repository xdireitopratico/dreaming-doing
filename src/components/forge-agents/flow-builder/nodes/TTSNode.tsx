import { type NodeProps } from "@/types/xyflow-react-shim";
import { Volume2 } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function TTSNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="tts"
      selected={selected}
      icon={<Volume2 className="h-3 w-3" />}
      label="TTS"
      subtitle={`🔊 ${config.voice || "default"}`}
    />
  );
}
