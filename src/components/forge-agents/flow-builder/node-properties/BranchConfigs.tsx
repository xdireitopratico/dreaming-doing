/**
 * Branch configs: Condition, Switch, OutputGuard
 */
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NodeConfigProps } from "./types";

export function ConditionConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Expressão</Label>
      <Textarea
        value={(config.expression as string) || ""}
        onChange={(e) => updateConfig("expression", e.target.value)}
        placeholder="ex: {{response.intent}} === 'compra'"
        className="mt-1 text-xs min-h-[60px]"
      />
    </div>
  );
}

export function SwitchConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Cases (um por linha)</Label>
      <Textarea
        value={((config.cases as string[]) || ["case_1", "case_2", "default"]).join("\n")}
        onChange={(e) => updateConfig("cases", e.target.value.split("\n").filter(Boolean))}
        className="mt-1 text-xs min-h-[60px]"
      />
    </div>
  );
}

export function OutputGuardConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Regras (uma por linha)</Label>
      <Textarea
        value={((config.rules as string[]) || ["pii_mask", "max_length"]).join("\n")}
        onChange={(e) => updateConfig("rules", e.target.value.split("\n").filter(Boolean))}
        className="mt-1 text-xs min-h-[60px]"
      />
    </div>
  );
}
