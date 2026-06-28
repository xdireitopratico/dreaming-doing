import { type NodeProps } from "@/types/xyflow-react-shim";
import { AlertTriangle } from "lucide-react";
import { BaseNode, resolveNodeStatus } from "./BaseNode";
import { getNodeIconSource } from "./NodeIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function ToolNode({ data, selected, id }: NodeProps) {
  const config = (data as Record<string, any>)?.config || {};
  const requiredSecrets: string[] = config.required_secrets || [];
  const hasSecretWarning = requiredSecrets.length > 0;
  return (
    <BaseNode id={id} cardType="configurable" iconContext="canvas" selected={selected} icon={getNodeIconSource("tool")} label="Tool" status={resolveNodeStatus(data)}
      subtitle={config.tool_display_name || config.tool_name || "Selecionar..."}>
      {hasSecretWarning && (
        <div className="absolute top-full mt-8 left-1/2 -translate-x-1/2 w-40">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 text-amber-400 cursor-pointer">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="text-[9px] truncate">Chave API necessária</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px]">
                <p className="text-xs font-medium mb-1">Secrets necessários:</p>
                <ul className="text-[11px] space-y-0.5">
                  {requiredSecrets.map((s) => <li key={s} className="font-mono text-amber-300">{s}</li>)}
                </ul>
                <p className="text-[10px] text-muted-foreground mt-1">Configure em Secrets do tenant para ativar esta tool.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </BaseNode>
  );
}
