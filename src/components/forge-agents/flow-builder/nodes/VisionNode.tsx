import { type NodeProps } from "@/types/xyflow-react-shim";
import { BaseNode } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";
import { findModel, getProviderForModel } from "../model-catalog-frontend";

export function VisionNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const modelId = config.model_id || "";
  const model = findModel(modelId);
  const provider = model ? getProviderForModel(modelId) : null;
  const subtitle = model ? `${provider?.label || "—"} · ${model.label}` : "Selecionar modelo";
  return <BaseNode selected={selected} icon={getNodeIconSource("vision")} label="Vision" subtitle={subtitle} />;
}
