/**
 * ToolConfig — Tool selector from registry (Supabase fetch)
 * Extracted from NodePropertiesPanel monolith
 */
import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { NodeConfigProps } from "./types";

export function ToolConfig({ config, updateConfig }: NodeConfigProps) {
  const currentToolName = (config.tool_name as string) || "";
  const [tools, setTools] = useState<{ name: string; display_name: string; category: string | null; required_secrets: string[] | null }[]>([]);
  const [loaded, setLoaded] = useState(false);

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
        <p className="text-[10px] text-muted-foreground font-mono">{currentToolName}</p>
      )}
    </div>
  );
}
