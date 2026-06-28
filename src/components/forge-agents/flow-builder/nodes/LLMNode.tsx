import { type NodeProps } from "@/types/xyflow-react-shim";
import { FlaskConical } from "lucide-react";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";
import { findModel, getProviderForModel } from "../model-catalog-frontend";

export function LLMNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const modelId = config.model_id || config.model || "";
  const temp = (config.temperature ?? 0.7).toFixed(1);
  const isTrial = !!config.trial_model;
  const model = findModel(modelId);
  const provider = model ? getProviderForModel(modelId) : null;
  const subtitle = model ? `${provider?.label || "—"} · ${model.label} · ${temp}` : "Selecionar modelo";
  return (
    <BaseNode cardType="configurable" iconContext="canvas" selected={selected} icon={getNodeIconSource("llm")} label="LLM" subtitle={subtitle}
      status={resolveNodeStatus(data)}>
      {isTrial && (
        <div className="absolute -top-1.5 -right-1.5 z-10">
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <FlaskConical className="h-2.5 w-2.5" /> Trial
          </span>
        </div>
      )}
    </BaseNode>
  );
}
