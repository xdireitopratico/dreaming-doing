import { useState } from "react";
import { Box, ExternalLink, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { ApiKeyInput } from "@/components/connectors/ApiKeyInput";
import { Button } from "@/components/ui/button";
import { saveE2bApiKey } from "@/lib/save-e2b-key";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";

interface E2bSandboxPanelProps {
  connected: boolean;
  onSaved?: () => void;
  onOpenConnectors?: () => void;
  compact?: boolean;
}

/** Painel no frame do preview — guia o usuário a liberar o sandbox E2B (BYOK). */
export function E2bSandboxPanel({
  connected,
  onSaved,
  onOpenConnectors,
  compact = false,
}: E2bSandboxPanelProps) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const entry = CONNECTOR_REGISTRY.e2b;

  if (connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Shield className="size-6" />
        </div>
        <p className="text-sm font-medium text-neutral-800">Sandbox E2B liberado</p>
        <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
          Sua chave está salva. Peça no chat para iniciar o preview ou use &quot;Abrir preview&quot;.
        </p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!key.trim().startsWith("e2b")) {
      toast.error("Cole uma chave E2B válida (prefixo e2b_)");
      return;
    }
    setBusy(true);
    try {
      await saveE2bApiKey(key);
      setKey("");
      toast.success("Sandbox E2B conectado — já pode rodar o preview");
      onSaved?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar chave E2B");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex h-full flex-col items-center justify-center bg-white text-center ${
        compact ? "gap-3 p-6" : "gap-4 p-8"
      }`}
    >
      <div className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
        <Box className="size-6" />
      </div>
      <div className="max-w-md space-y-2">
        <p className="text-sm font-medium text-neutral-900">Conecte seu sandbox E2B</p>
        <p className="text-sm text-neutral-600 leading-relaxed">
          O preview ao vivo e o agente executam código no <strong>E2B</strong> com a sua conta — não usamos
          chave global. Cole a API key aqui e eu já rodo o projeto.
        </p>
      </div>

      <div className="w-full max-w-sm text-left space-y-2">
        <ApiKeyInput
          label="Chave API E2B"
          value={key}
          onChange={setKey}
          provider="e2b"
          placeholder="e2b_..."
          saved={false}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-2 justify-center">
          <Button
            type="button"
            size="sm"
            className="bg-neutral-900 text-white hover:bg-neutral-800"
            disabled={busy || !key.trim()}
            onClick={() => void handleSave()}
          >
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                Salvando…
              </>
            ) : (
              "Liberar sandbox"
            )}
          </Button>
          {onOpenConnectors && (
            <Button type="button" size="sm" variant="outline" onClick={onOpenConnectors}>
              Abrir Conectores
            </Button>
          )}
        </div>
      </div>

      <a
        href={entry.signupUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800"
      >
        Criar conta na E2B
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}