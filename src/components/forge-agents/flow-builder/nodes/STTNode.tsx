import { type NodeProps } from "@xyflow/react";
import { Mic } from "lucide-react";
import { BaseNode } from "./BaseNode";

export function STTNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  return (
    <BaseNode
      nodeType="stt"
      selected={selected}
      icon={<Mic className="h-3 w-3" />}
      label="STT"
      subtitle={`🎤 ${config.language || "pt-BR"}`}
    />
  );
}
