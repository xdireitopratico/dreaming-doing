/**
 * Audio configs: STT, TTS
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NodeConfigProps } from "./types";

export function STTConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Idioma</Label>
      <Select value={(config.language as string) || "pt-BR"} onValueChange={(v) => updateConfig("language", v)}>
        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pt-BR">Português (BR)</SelectItem>
          <SelectItem value="en-US">English (US)</SelectItem>
          <SelectItem value="es-ES">Español</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TTSConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Voz</Label>
      <Input
        value={(config.voice as string) || ""}
        onChange={(e) => updateConfig("voice", e.target.value)}
        placeholder="ex: alloy, nova, shimmer"
        className="h-8 text-xs mt-1"
      />
    </div>
  );
}
