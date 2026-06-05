import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";

export function PreviewEmptyGuide({
  projectName,
  e2bConnected,
  agentHasRun,
  onOpenPreview,
}: {
  projectName?: string;
  e2bConnected: boolean;
  agentHasRun: boolean;
  onOpenPreview?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 bg-white p-8 text-center forge-preview-empty-single">
      <div className="grid size-14 place-items-center rounded-2xl bg-neutral-100">
        <Eye className="size-7 text-neutral-400" />
      </div>
      <div className="max-w-sm space-y-2">
        <p className="text-base font-medium text-neutral-900">
          Quando seu projeto for criado, ele aparecerá aqui
        </p>
        <p className="text-sm text-neutral-500 leading-relaxed">
          {projectName ? (
            <>
              <strong>{projectName}</strong> será exibido neste painel como um site no navegador
              embutido.
            </>
          ) : (
            <>O preview ao vivo abre depois que o agente gravar arquivos no sandbox E2B.</>
          )}
        </p>
        {!e2bConnected && (
          <p className="text-xs text-amber-800/90 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            Configure a chave E2B em{" "}
            <Link to="/api" className="underline font-medium">
              API Keys
            </Link>{" "}
            para habilitar o sandbox.
          </p>
        )}
      </div>
      {onOpenPreview && e2bConnected && agentHasRun && (
        <button
          type="button"
          onClick={onOpenPreview}
          className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Conectar preview agora
        </button>
      )}
    </div>
  );
}