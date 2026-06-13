/**
 * Control configs: Trigger, Loop, Delay, SubFlow, ErrorHandler, HITL
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { NodeConfigProps } from "./types";

export function TriggerConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Canal</Label>
      <Select value={(config.channel as string) || "web"} onValueChange={(v) => updateConfig("channel", v)}>
        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="web">Web Widget</SelectItem>
          <SelectItem value="whatsapp">WhatsApp</SelectItem>
          <SelectItem value="api">API REST</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function LoopConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Máx. iterações</Label>
      <Input
        type="number"
        value={(config.max_iterations as number) ?? 10}
        onChange={(e) => updateConfig("max_iterations", parseInt(e.target.value) || 10)}
        className="h-8 text-xs mt-1"
      />
    </div>
  );
}

export function DelayConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Segundos</Label>
      <Input
        type="number"
        value={(config.seconds as number) ?? 5}
        onChange={(e) => updateConfig("seconds", parseInt(e.target.value) || 5)}
        className="h-8 text-xs mt-1"
      />
    </div>
  );
}

export function SubFlowConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Nome do Flow</Label>
      <Input
        value={(config.flow_name as string) || ""}
        onChange={(e) => updateConfig("flow_name", e.target.value)}
        placeholder="ID ou nome do sub-flow"
        className="h-8 text-xs mt-1"
      />
    </div>
  );
}

export function ErrorHandlerConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <>
      <div>
        <Label className="text-xs">Retry count</Label>
        <Input
          type="number"
          value={(config.retry_count as number) ?? 3}
          onChange={(e) => updateConfig("retry_count", parseInt(e.target.value))}
          className="h-8 text-xs mt-1"
        />
      </div>
      <div>
        <Label className="text-xs">Fallback</Label>
        <Select value={(config.fallback as string) || "log_skip"} onValueChange={(v) => updateConfig("fallback", v)}>
          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="log_skip">Log + Skip</SelectItem>
            <SelectItem value="retry">Retry</SelectItem>
            <SelectItem value="dlq">Dead Letter Queue</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

export function HITLConfig({ config, updateConfig }: NodeConfigProps) {
  return (
    <div>
      <Label className="text-xs">Timeout (minutos)</Label>
      <Input
        type="number"
        value={(config.timeout_minutes as number) ?? 60}
        onChange={(e) => updateConfig("timeout_minutes", parseInt(e.target.value))}
        className="h-8 text-xs mt-1"
      />
    </div>
  );
}
