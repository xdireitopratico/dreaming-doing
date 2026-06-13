/**
 * ToolConfig — Tool selector from registry (Supabase fetch)
 * Extracted from NodePropertiesPanel monolith
 */
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { testToolHealth, type ToolHealthStatus } from "@/lib/tool-health-test";
import type { NodeConfigProps } from "./types";

export interface ToolConfigProps extends NodeConfigProps {
  flowId?: string;
}

export function ToolConfig({ config, updateConfig, flowId }: ToolConfigProps) {
  const currentToolName = (config.tool_name as string) || "";
  const [tools, setTools] = useState<{ name: string; display_name: string; category: string | null; required_secrets: string[] | null }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [health, setHealth] = useState<ToolHealthStatus>("idle");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (loaded) return;
    supabase
      .from("tool_registry")
      .select("name, display_name, category, required_secrets")
      .eq("is_active", true)
      .order("display_name")
      .then(({ data }) => {
        setTools((data || []) as typeof tools);
        setLoaded(true);
      });
  }, [loaded]);

  return (
    <div className="space-y-2">
      <Label className="text-xs">Tool do Registry</Label>
      <Select
        value={currentToolName}
        onValueChange={(v) => {
          const t = tools.find((t) => t.name === v);
          updateConfig("tool_name", v);
          updateConfig("tool_display_name", t?.display_name || v);
          updateConfig("required_secrets", t?.required_secrets || []);
        }}
      >
        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Selecionar tool..." /></SelectTrigger>
        <SelectContent>
          {tools.map((t) => (
            <SelectItem key={t.name} value={t.name} className="text-xs">
              <span>{t.display_name}</span>
              {t.category && <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">{t.category}</Badge>}
            </SelectItem>
          ))}
          {tools.length === 0 && <div className="text-xs text-muted-foreground p-2">Nenhuma tool ativa</div>}
        </SelectContent>
      </Select>
      {currentToolName && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground font-mono">{currentToolName}</p>
          {flowId && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                setHealth("testing");
                const result = await testToolHealth(flowId, currentToolName);
                setHealth(result.health);
                setTesting(false);
              }}
            >
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              <span className="ml-1">
                {health === "healthy" ? "OK" : health === "degraded" ? "Parcial" : health === "unhealthy" ? "Erro" : "Testar"}
              </span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
