/**
 * PhysicianConfigPanel — Auto-heal config per flow
 * P15: Toggle, thresholds, allowed treatments, shadow mode
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Save, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/lib/toast";

const ALL_TREATMENTS = [
  { id: "prompt_rewrite", label: "Reescrita de Prompt" },
  { id: "model_switch", label: "Troca de Modelo" },
  { id: "timeout_adjust", label: "Ajuste de Timeout" },
  { id: "cache_clear", label: "Limpar Cache" },
  { id: "rollback", label: "Rollback de Versão" },
];

interface Props {
  flowId: string;
  flowName?: string;
}

interface HealConfig {
  id?: string;
  enabled: boolean;
  shadow_mode: boolean;
  error_spike_threshold: number;
  quality_drop_threshold: number;
  latency_spike_threshold_ms: number;
  max_auto_corrections: number;
  check_interval_minutes: number;
  allowed_treatments: string[];
  notify_on_heal: boolean;
  notify_email: string;
}

const DEFAULT_CONFIG: HealConfig = {
  enabled: false,
  shadow_mode: true,
  error_spike_threshold: 0.3,
  quality_drop_threshold: 0.2,
  latency_spike_threshold_ms: 10000,
  max_auto_corrections: 5,
  check_interval_minutes: 30,
  allowed_treatments: ["prompt_rewrite", "model_switch", "timeout_adjust", "cache_clear"],
  notify_on_heal: true,
  notify_email: "",
};

export function PhysicianConfigPanel({ flowId, flowName }: Props) {
  const [config, setConfig] = useState<HealConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  ;

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("prometheus_auto_heal_config")
        .select("*")
        .eq("flow_id", flowId)
        .maybeSingle();

      if (data) {
        setConfig({
          id: data.id,
          enabled: data.enabled ?? false,
          shadow_mode: data.shadow_mode ?? true,
          error_spike_threshold: data.error_spike_threshold ?? 0.3,
          quality_drop_threshold: data.quality_drop_threshold ?? 0.2,
          latency_spike_threshold_ms: data.latency_spike_threshold_ms ?? 10000,
          max_auto_corrections: data.max_auto_corrections ?? 5,
          check_interval_minutes: data.check_interval_minutes ?? 30,
          allowed_treatments: (data.allowed_treatments as string[]) ?? DEFAULT_CONFIG.allowed_treatments,
          notify_on_heal: data.notify_on_heal ?? true,
          notify_email: data.notify_email ?? "",
        });
      }
      setLoading(false);
    })();
  }, [flowId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const payload = {
        flow_id: flowId,
        user_id: user.id,
        enabled: config.enabled,
        shadow_mode: config.shadow_mode,
        error_spike_threshold: config.error_spike_threshold,
        quality_drop_threshold: config.quality_drop_threshold,
        latency_spike_threshold_ms: config.latency_spike_threshold_ms,
        max_auto_corrections: config.max_auto_corrections,
        check_interval_minutes: config.check_interval_minutes,
        allowed_treatments: config.allowed_treatments,
        notify_on_heal: config.notify_on_heal,
        notify_email: config.notify_email || null,
        updated_at: new Date().toISOString(),
      };

      if (config.id) {
        await supabase.from("prometheus_auto_heal_config").update(payload).eq("id", config.id);
      } else {
        const { data } = await supabase.from("prometheus_auto_heal_config").insert(payload).select("id").single();
        if (data) setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast({ title: "Configuração salva", description: "Auto-heal atualizado com sucesso." });
    } catch (err) {
      toast({ title: "Erro ao salvar", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [config, flowId, toast]);

  const toggleTreatment = (treatmentId: string) => {
    setConfig(prev => ({
      ...prev,
      allowed_treatments: prev.allowed_treatments.includes(treatmentId)
        ? prev.allowed_treatments.filter(t => t !== treatmentId)
        : [...prev.allowed_treatments, treatmentId],
    }));
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Physician — Auto-Heal</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            {config.shadow_mode && config.enabled && (
              <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-500">
                <AlertTriangle className="h-3 w-3 mr-1" /> Shadow Mode
              </Badge>
            )}
            <Switch checked={config.enabled} onCheckedChange={v => setConfig(p => ({ ...p, enabled: v }))} />
          </div>
        </div>
        {flowName && <p className="text-xs text-muted-foreground mt-1">{flowName}</p>}
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Shadow Mode */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Shadow Mode</Label>
            <p className="text-xs text-muted-foreground">Simula tratamentos sem aplicar em produção</p>
          </div>
          <Switch checked={config.shadow_mode} onCheckedChange={v => setConfig(p => ({ ...p, shadow_mode: v }))} />
        </div>

        {/* Thresholds */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Error Spike Threshold</Label>
            <Input type="number" step="0.05" min="0.05" max="1" value={config.error_spike_threshold}
              onChange={e => setConfig(p => ({ ...p, error_spike_threshold: +e.target.value }))} className="h-8 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Taxa de erro para disparar (0-1)</p>
          </div>
          <div>
            <Label className="text-xs">Quality Drop Threshold</Label>
            <Input type="number" step="0.05" min="0.05" max="1" value={config.quality_drop_threshold}
              onChange={e => setConfig(p => ({ ...p, quality_drop_threshold: +e.target.value }))} className="h-8 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Queda de qualidade (0-1)</p>
          </div>
          <div>
            <Label className="text-xs">Latency Spike (ms)</Label>
            <Input type="number" step="1000" min="1000" value={config.latency_spike_threshold_ms}
              onChange={e => setConfig(p => ({ ...p, latency_spike_threshold_ms: +e.target.value }))} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Max Correções/dia</Label>
            <Input type="number" step="1" min="1" max="20" value={config.max_auto_corrections}
              onChange={e => setConfig(p => ({ ...p, max_auto_corrections: +e.target.value }))} className="h-8 text-sm" />
          </div>
        </div>

        {/* Allowed Treatments */}
        <div>
          <Label className="text-xs mb-2 block">Tratamentos Permitidos</Label>
          <div className="space-y-2">
            {ALL_TREATMENTS.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <Checkbox id={t.id} checked={config.allowed_treatments.includes(t.id)}
                  onCheckedChange={() => toggleTreatment(t.id)} />
                <label htmlFor={t.id} className="text-sm cursor-pointer">{t.label}</label>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">Notificar ao curar</Label>
          <Switch checked={config.notify_on_heal} onCheckedChange={v => setConfig(p => ({ ...p, notify_on_heal: v }))} />
        </div>
        {config.notify_on_heal && (
          <div>
            <Label className="text-xs">Email de notificação</Label>
            <Input type="email" value={config.notify_email} placeholder="seu@email.com"
              onChange={e => setConfig(p => ({ ...p, notify_email: e.target.value }))} className="h-8 text-sm" />
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full" size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configuração
        </Button>
      </CardContent>
    </Card>
  );
}
