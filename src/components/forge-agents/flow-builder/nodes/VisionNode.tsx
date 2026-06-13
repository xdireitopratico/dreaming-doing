import { type NodeProps } from "@xyflow/react";
import { Eye } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { findModel, getProviderForModel } from "../model-catalog-frontend";

export function VisionNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const modelId = config.model_id || "";
  const model = findModel(modelId);
  const provider = model ? getProviderForModel(modelId) : null;

  const subtitle = model
    ? `${provider?.label || "—"} · ${model.label}`
    : "Selecionar modelo";

  return (
    <BaseNode
      nodeType="vision"
      selected={selected}
      icon={<Eye className="h-3 w-3" />}
      label="Vision"
      subtitle={subtitle}
    />
  );
}
