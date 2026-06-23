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
import {
  addCustomProvider,
  saveCustomProviderToDb,
  type CustomProviderId,
} from "@/lib/ai-provider-registry";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";

interface AddProviderModalProps {
  open: boolean;
  onClose: () => void;
  onAdded?: (id: CustomProviderId) => void;
}

export function AddProviderModal({ open, onClose, onAdded }: AddProviderModalProps) {
  const { user } = useAuth();
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [keyPrefix, setKeyPrefix] = useState("sk-");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setLabel("");
    setBaseUrl("");
    setKeyPrefix("sk-");
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
      const provider = addCustomProvider({
        label: label.trim(),
        baseUrl: baseUrl.trim().replace(/\/$/, ""),
        keyPrefix: keyPrefix.trim() || "sk-",
      });
      if (user) {
        await saveCustomProviderToDb(
          supabase,
          {
            provider_id: provider.id.replace(/^custom-/, ""),
            label: provider.label,
            base_url: provider.baseUrl,
          },
          user.id,
        );
      }
      toast.success("Provider adicionado");
      onAdded?.(provider.id);
      reset();
      onClose();
      window.dispatchEvent(new Event("forge:prefs-updated"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao adicionar");
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
              placeholder="ex.: Inception Labs"
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
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
