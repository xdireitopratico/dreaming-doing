/**
 * LLMConfig — Model selector + fallback model + temperature + max tokens + system prompt
 * Extracted from NodePropertiesPanel monolith
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { PromptEditorPanel } from "../PromptEditorPanel";
import { ModelSelectorPanel } from "../ModelSelectorPanel";
import { findModel, getProviderForModel } from "../model-catalog-frontend";
import type { NodeConfigProps } from "./types";
import { ShieldAlert } from "lucide-react";

export function LLMConfig({ config, updateConfig }: NodeConfigProps) {
  const modelId = (config.model_id as string) || (config.model as string) || "";
  const fallbackModelId = (config.fallback_model_id as string) || "";

  const handleModelSelect = (id: string) => {
    updateConfig("model_id", id);
    const model = findModel(id);
    if (model) updateConfig("model", model.modelName);
  };

  const handleFallbackSelect = (id: string) => {
    updateConfig("fallback_model_id", id);
  };

  const clearFallback = () => {
    updateConfig("fallback_model_id", "");
  };

  const selectedModel = findModel(modelId);
  const provider = selectedModel ? getProviderForModel(modelId) : null;
  const fallbackModel = fallbackModelId ? findModel(fallbackModelId) : null;
  const fallbackProvider = fallbackModel ? getProviderForModel(fallbackModelId) : null;

  return (
    <>
      <div>
        <Label className="text-xs mb-1 block">Modelo Principal</Label>
        {selectedModel && provider && (
          <div className="mb-2 flex items-center gap-1.5">
            <Badge className={`text-[9px] px-1.5 py-0 border-0 ${provider.badgeBg} ${provider.badgeText}`}>
              {provider.label}
            </Badge>
            <span className="text-[10px] font-medium">{selectedModel.label}</span>
          </div>
        )}
        <ModelSelectorPanel selectedModelId={modelId} onSelect={handleModelSelect} />
      </div>

      {/* Fallback Model */}
      <div className="pt-2 border-t border-border/40">
        <div className="flex items-center gap-1.5 mb-1">
          <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
          <Label className="text-xs">Modelo de Fallback</Label>
          <span className="text-[9px] text-muted-foreground">(opcional)</span>
        </div>
        <p className="text-[10px] text-muted-foreground mb-2">
          Se o modelo principal falhar, este modelo será usado automaticamente.
        </p>
        {fallbackModel && fallbackProvider && (
          <div className="mb-2 flex items-center gap-1.5">
            <Badge className={`text-[9px] px-1.5 py-0 border-0 ${fallbackProvider.badgeBg} ${fallbackProvider.badgeText}`}>
              {fallbackProvider.label}
            </Badge>
            <span className="text-[10px] font-medium">{fallbackModel.label}</span>
            <button onClick={clearFallback} className="text-[9px] text-destructive hover:underline ml-auto">
              Remover
            </button>
          </div>
        )}
        <ModelSelectorPanel selectedModelId={fallbackModelId} onSelect={handleFallbackSelect} />
      </div>

      <div>
        <Label className="text-xs">
          Temperatura: {((config.temperature as number) ?? 0.7).toFixed(1)}
        </Label>
        <Slider
          value={[(config.temperature as number) ?? 0.7]}
          onValueChange={([v]) => updateConfig("temperature", v)}
          min={0} max={2} step={0.1}
          className="mt-2"
        />
      </div>

      <div>
        <Label className="text-xs">Max Tokens</Label>
        <Input
          type="number"
          value={(config.max_tokens as number) ?? 1024}
          onChange={(e) => updateConfig("max_tokens", parseInt(e.target.value) || 1024)}
          className="h-8 text-xs mt-1"
          min={1} max={128000}
        />
      </div>

      <PromptEditorPanel
        value={(config.system_prompt as string) || ""}
        onChange={(v) => updateConfig("system_prompt", v)}
        label="System Prompt"
        placeholder="Instruções do agente..."
      />
    </>
  );
}
