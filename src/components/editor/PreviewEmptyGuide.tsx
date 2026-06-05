import { Link } from "@tanstack/react-router";
import { Eye, Hammer, KeyRound } from "lucide-react";

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
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-5 bg-white p-8 text-center forge-preview-empty-single">
      <div className="grid size-14 place-items-center rounded-2xl bg-neutral-100">
        <Eye className="size-7 text-neutral-400" />
      </div>
      <div className="max-w-md space-y-2">
        <p className="text-base font-medium text-neutral-900">
          {projectName ? projectName : "Seu projeto"} aparecerá aqui
        </p>
        <p className="text-sm text-neutral-600 leading-relaxed">
          Esta área é o <strong>preview estático</strong>: quando o agente gravar arquivos no
          sandbox, o site será exibido neste painel — como um navegador embutido, com rotas entre
          páginas na barra acima.
        </p>
        {!e2bConnected && (
          <p className="text-sm text-amber-800/90 leading-relaxed rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <KeyRound className="inline size-3.5 mr-1 -mt-0.5" />
            Primeiro passo: configure a chave <strong>E2B</strong> em{" "}
            <Link to="/api" className="underline font-medium">
              API Keys
            </Link>
            . Sem sandbox não há construção nem preview ao vivo.
          </p>
        )}
        {e2bConnected && !agentHasRun && (
          <p className="text-sm text-neutral-500 leading-relaxed">
            <Hammer className="inline size-3.5 mr-1 -mt-0.5" />
            Envie um pedido no chat (modo <strong>Build</strong>) ou use{" "}
            <strong>Start Project</strong> para a IA começar o MVP.
          </p>
        )}
        {e2bConnected && agentHasRun && (
          <p className="text-sm text-neutral-500 leading-relaxed">
            O agente já rodou — o preview pode levar alguns segundos para sincronizar com o E2B.
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
      <p className="font-mono text-[9px] text-neutral-400 max-w-sm">
        Nemotron 550B: em Modelos use ROBIN + NVIDIA ou Fixo com{" "}
        <span className="text-neutral-600">nvidia/nemotron-3-ultra-550b-a55b</span>
      </p>
    </div>
  );
}