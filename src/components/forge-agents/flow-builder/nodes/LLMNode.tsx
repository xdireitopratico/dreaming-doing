import { type NodeProps } from "@/types/xyflow-react-shim";
import { Bot, FlaskConical } from "lucide-react";
import { BaseNode } from "./BaseNode";
import { findModel, getProviderForModel } from "../model-catalog-frontend";

export function LLMNode({ data, selected }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const modelId = config.model_id || config.model || "";
  const temp = (config.temperature ?? 0.7).toFixed(1);
  const isTrial = !!config.trial_model;

  const model = findModel(modelId);
  const provider = model ? getProviderForModel(modelId) : null;

  const subtitle = model
    ? `${provider?.label || "—"} · ${model.label} · ${temp}`
    : "Selecionar modelo";

  return (
    <BaseNode
      nodeType="llm"
      selected={selected}
      icon={<Bot className="h-3 w-3" />}
      label="LLM"
      subtitle={subtitle}
      badge={isTrial ? (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <FlaskConical className="h-2.5 w-2.5" />
          Trial
        </span>
      ) : undefined}
    />
  );
}
