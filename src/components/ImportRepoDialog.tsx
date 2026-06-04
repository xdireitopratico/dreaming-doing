import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Github, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  trigger?: React.ReactNode;
};

export function ImportRepoDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function importRepo() {
    const v = url.trim();
    if (!v) return;
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        toast.error("Faça login antes.");
        navigate({ to: "/auth", search: { next: "/projects" } as never });
        return;
      }
      const { data, error } = await supabase.functions.invoke("github-import", {
        body: { url: v },
      });
      if (error) throw new Error(error.message);
      const res = data as { projectId?: string; fileCount?: number; error?: string };
      if (res.error) throw new Error(res.error);
      if (!res.projectId) throw new Error("Resposta inválida do servidor");

      toast.success(`Importados ${res.fileCount ?? 0} arquivos.`);
      setOpen(false);
      navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="gap-2">
            <Github className="size-4" /> Importar do GitHub
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar repositório público</DialogTitle>
          <DialogDescription>
            Cole a URL de um repo público no GitHub. Vou baixar o código (sem
            <code className="mx-1 text-xs px-1 py-0.5 rounded bg-muted">node_modules</code>
            ou binários) e abrir um projeto novo pronto pra você conversar.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Input
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") importRepo(); }}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Limite: 2.000 arquivos · 1 MB cada · sem binários (PNG, fonts, etc).
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={importRepo} disabled={busy || !url.trim()} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
            {busy ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
