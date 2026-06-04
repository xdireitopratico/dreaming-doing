import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Save, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type Snapshot = { id: string; label: string | null; created_at: string; tree: Record<string, string> };

export function SnapshotsSheet({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [savingLabel, setSavingLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const { data: snapshots, refetch } = useQuery({
    queryKey: ["snapshots", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_snapshots")
        .select("id, label, created_at, tree")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Snapshot[];
    },
    enabled: open,
  });

  async function saveSnapshot() {
    setBusy(true);
    try {
      const { data: files, error: fErr } = await supabase
        .from("project_files")
        .select("path, content")
        .eq("project_id", projectId);
      if (fErr) throw fErr;
      const tree: Record<string, string> = {};
      for (const f of files ?? []) tree[f.path] = f.content ?? "";
      const label = savingLabel.trim() || new Date().toLocaleString("pt-BR");
      const { error } = await supabase.from("project_snapshots").insert({
        project_id: projectId,
        label,
        tree,
      });
      if (error) throw error;
      toast.success("Snapshot salvo");
      setSavingLabel("");
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function restoreSnapshot(snap: Snapshot) {
    if (!confirm(`Restaurar "${snap.label}"? Isso sobrescreve todos os arquivos atuais.`)) return;
    setBusy(true);
    try {
      const tree = snap.tree ?? {};
      // Apaga tudo do projeto
      const { error: delErr } = await supabase.from("project_files").delete().eq("project_id", projectId);
      if (delErr) throw delErr;
      // Insere tudo do snapshot
      const rows = Object.entries(tree).map(([path, content]) => ({
        project_id: projectId, path, content: content as string,
      }));
      if (rows.length > 0) {
        for (let i = 0; i < rows.length; i += 50) {
          const chunk = rows.slice(i, i + 50);
          const { error } = await supabase.from("project_files").insert(chunk);
          if (error) throw error;
        }
      }
      toast.success(`Restaurado: ${rows.length} arquivos`);
      qc.invalidateQueries({ queryKey: ["files", projectId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao restaurar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Snapshots"
          className="size-8 grid place-items-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-foreground transition-colors"
        >
          <History className="size-4" />
        </button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Versões</SheetTitle>
          <SheetDescription>
            Snapshots de todos os arquivos do projeto. Restaure quando quiser voltar.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex gap-2">
          <input
            placeholder="rótulo (opcional)"
            value={savingLabel}
            onChange={(e) => setSavingLabel(e.target.value)}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm h-9 outline-none focus:border-[var(--primary)]/50"
            disabled={busy}
          />
          <Button onClick={saveSnapshot} disabled={busy} size="sm" className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Salvar
          </Button>
        </div>

        <ScrollArea className="mt-4 flex-1 -mx-6 px-6">
          {!snapshots || snapshots.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-8 text-center">
              Nenhum snapshot ainda.
            </p>
          ) : (
            <ul className="space-y-2 pb-4">
              {snapshots.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 p-3 rounded-md border border-[var(--border)] bg-[var(--surface-1)]/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.label}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("pt-BR")} ·{" "}
                      {Object.keys(s.tree ?? {}).length} arquivos
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => restoreSnapshot(s)}
                    disabled={busy}
                    className="gap-1.5 shrink-0"
                  >
                    <RotateCcw className="size-3.5" /> Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
