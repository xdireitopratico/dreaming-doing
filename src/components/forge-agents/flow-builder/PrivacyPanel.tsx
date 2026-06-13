/**
 * PrivacyPanel — LGPD/GDPR data export and deletion
 * R54: Max 150 lines
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { X, Download, Trash2, Shield, AlertTriangle, Loader2, FileJson } from "lucide-react";

interface PrivacyPanelProps {
  onClose: () => void;
}

export function PrivacyPanel({ onClose }: PrivacyPanelProps) {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  ;

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("aetherforge-gdpr", {
        body: { action: "summary" },
      });
      if (error) throw error;
      setSummary(data?.data_summary || {});
    } catch (err: any) {
      console.error("[PrivacyPanel] Summary error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("aetherforge-gdpr", {
        body: { action: "export" },
      });
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aetherforge-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "Dados exportados com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("aetherforge-gdpr", {
        body: { action: "delete" },
      });
      if (error) throw error;

      toast({ title: "Dados excluídos", description: `${data?.tables_cleared?.length || 0} tabelas limpas.` });
      setConfirmDelete(false);
      loadSummary();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const LABELS: Record<string, string> = {
    agent_flows: "Flows",
    agent_executions: "Execuções",
    agent_deployments: "Deploys",
    agent_marketplace_listings: "Publicações",
  };

  return (
    <div className="w-[380px] border-l bg-background flex flex-col shrink-0 overflow-hidden">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Privacidade & Dados</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Data Summary */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase">Seus Dados</h4>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : summary ? (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(summary).map(([key, count]) => (
                <div key={key} className="border rounded-lg p-2.5 text-center">
                  <div className="text-lg font-bold">{count}</div>
                  <div className="text-[10px] text-muted-foreground">{LABELS[key] || key}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhum dado encontrado.</p>
          )}
        </div>

        {/* Export */}
        <div className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium">Exportar Dados</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Baixe todos os seus dados (flows, execuções, deploys) em formato JSON conforme LGPD Art. 18.
          </p>
          <Button size="sm" variant="outline" className="w-full gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {exporting ? "Exportando..." : "Exportar JSON"}
          </Button>
        </div>

        {/* Delete */}
        <div className="border border-destructive/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-xs font-medium text-destructive">Excluir Dados</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Remove permanentemente todos os seus dados da plataforma. Esta ação é irreversível (LGPD Art. 18, V).
          </p>

          {!confirmDelete ? (
            <Button size="sm" variant="destructive" className="w-full gap-2" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Solicitar Exclusão
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="bg-destructive/10 rounded p-2 text-[10px] text-destructive font-medium">
                ⚠ Confirma a exclusão PERMANENTE de todos os seus dados? Esta ação NÃO pode ser desfeita.
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </Button>
                <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {deleting ? "Excluindo..." : "Confirmar"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Legal info */}
        <div className="text-[10px] text-muted-foreground space-y-1 pt-2">
          <p>📋 <strong>LGPD</strong> — Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</p>
          <p>📋 <strong>GDPR</strong> — General Data Protection Regulation (EU 2016/679)</p>
          <p>Seus dados são processados com base no consentimento (Art. 7, I) e na execução de contrato (Art. 7, V).</p>
        </div>
      </div>
    </div>
  );
}
