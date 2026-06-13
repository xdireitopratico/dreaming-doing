/**
 * VisionConfig — Model + image source + analysis prompt
 */
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NodeConfigProps } from "./types";

export function VisionConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <>
      <div>
        <Label className="text-xs">Modelo de Visão</Label>
        <Select value={(config.model_id as string) || ""} onValueChange={(v) => updateConfig("model_id", v)}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Selecionar modelo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
            <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
            <SelectItem value="gpt-5">GPT-5</SelectItem>
            <SelectItem value="gpt-5-mini">GPT-5 Mini</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Fonte da Imagem</Label>
        <Select value={(config.image_source as string) || "url"} onValueChange={(v) => updateConfig("image_source", v)}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="url">URL da imagem</SelectItem>
            <SelectItem value="base64">Base64</SelectItem>
            <SelectItem value="input">Do input anterior</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Prompt de Análise</Label>
        <Textarea
          value={(config.analysis_prompt as string) || ""}
          onChange={(e) => updateConfig("analysis_prompt", e.target.value)}
          placeholder="Descreva o que analisar na imagem..."
          className="mt-1 text-xs min-h-[60px]"
        />
      </div>
    </>
  );
}
