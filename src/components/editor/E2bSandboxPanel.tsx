import { Link } from "@tanstack/react-router";
import { Box, ExternalLink, Key } from "lucide-react";
import { Button } from "@/components/ui/button";

interface E2bSandboxPanelProps {
  connected: boolean;
  compact?: boolean;
}

/** Painel no preview — redireciona para API Keys (única fonte de chaves). */
export function E2bSandboxPanel({ connected, compact = false }: E2bSandboxPanelProps) {
  if (connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white p-8 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Key className="size-6" />
        </div>
        <p className="text-sm font-medium text-neutral-800">Sandbox E2B liberado</p>
        <p className="text-sm text-neutral-500 max-w-sm leading-relaxed">
          Sua chave está em API Keys. Peça no chat para iniciar o preview ou use &quot;Abrir preview&quot;.
        </p>
      </div>
    );
  }

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
        <p className="text-sm font-medium text-neutral-900">Configure o sandbox E2B</p>
        <p className="text-sm text-neutral-600 leading-relaxed">
          O preview e o agente precisam da sua chave E2B. Cole em{" "}
          <strong>API Keys</strong> — é o único lugar onde salvamos credenciais de API.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        className="bg-neutral-900 text-white hover:bg-neutral-800"
        asChild
      >
        <Link to="/api" hash="forge-key-e2b">
          Abrir API Keys
        </Link>
      </Button>
      <a
        href="https://e2b.dev/docs"
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