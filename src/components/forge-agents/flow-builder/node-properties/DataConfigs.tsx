/**
 * Data configs: RAG Search, Memory, Transformer
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NodeConfigProps } from "./types";

export function RAGConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Top K</Label>
      <Input
        type="number"
        value={(config.top_k as number) ?? 5}
        onChange={(e) => updateConfig("top_k", parseInt(e.target.value))}
        className="h-8 text-xs mt-1"
      />
    </div>
  );
}

export function MemoryConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <>
      <div>
        <Label className="text-xs">Operação</Label>
        <Select value={(config.operation as string) || "read"} onValueChange={(v) => updateConfig("operation", v)}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="read">Ler</SelectItem>
            <SelectItem value="write">Escrever</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Chave</Label>
        <Input
          value={(config.key as string) || ""}
          onChange={(e) => updateConfig("key", e.target.value)}
          placeholder="ex: user_preference"
          className="h-8 text-xs mt-1"
        />
      </div>
    </>
  );
}

export function TransformerConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Template de transformação</Label>
      <Textarea
        value={(config.template as string) || ""}
        onChange={(e) => updateConfig("template", e.target.value)}
        placeholder="ex: {{input.text | uppercase}}"
        className="mt-1 text-xs min-h-[60px]"
      />
    </div>
  );
}
