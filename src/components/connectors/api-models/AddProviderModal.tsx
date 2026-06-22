import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCustomProvider } from "@/lib/ai-provider-registry";
import { toast } from "@/lib/toast";

interface AddProviderModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddProviderModal({ open, onClose }: AddProviderModalProps) {
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [keyPrefix, setKeyPrefix] = useState("sk-");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setLabel("");
    setBaseUrl("");
    setKeyPrefix("sk-");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !baseUrl.trim()) {
      toast.error("Preencha nome e URL base");
      return;
    }
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      toast.error("URL base deve começar com http:// ou https://");
      return;
    }
    setBusy(true);
    try {
      addCustomProvider({
        label: label.trim(),
        baseUrl: baseUrl.trim().replace(/\/$/, ""),
        keyPrefix: keyPrefix.trim() || "sk-",
      });
      toast.success("Provider adicionado");
      reset();
      onClose();
      window.dispatchEvent(new Event("forge:prefs-updated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Adicionar provider custom</DialogTitle>
          <DialogDescription className="font-mono text-[10px] text-[var(--text-dim)]">
            Qualquer endpoint OpenAI-compatible. A chave é salva de forma segura.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="font-mono text-[9px] text-[var(--text-dim)]">Nome</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex.: Minha API local"
              className="mt-1 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="font-mono text-[9px] text-[var(--text-dim)]">Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.exemplo.com/v1"
              className="mt-1 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="font-mono text-[9px] text-[var(--text-dim)]">Prefixo da chave (opcional)</Label>
            <Input
              value={keyPrefix}
              onChange={(e) => setKeyPrefix(e.target.value)}
              placeholder="sk-"
              className="mt-1 font-mono text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-[var(--primary)] text-[#0a0a0a]"
              disabled={busy}
            >
              {busy ? "Adicionando…" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
