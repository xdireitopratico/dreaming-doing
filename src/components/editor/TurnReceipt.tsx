import { FileEdit, FilePlus, RefreshCw } from "lucide-react";
import type { AgentProgress } from "@/lib/agent-progress";

type TurnReceiptProps = {
  progress: AgentProgress;
  runId?: string;
  onResume?: () => void;
};

function fileBase(path: string): string {
  const p = path.replace(/^\/+/, "");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function collectReceiptFiles(progress: AgentProgress): string[] {
  const paths = new Set<string>();
  for (const p of progress.deliveryFiles ?? []) {
    if (p) paths.add(p);
  }
  for (const d of progress.diffs) {
    if (d.path) paths.add(d.path);
  }
  for (const t of progress.tools) {
    if ((t.name === "fs_write" || t.name === "fs_edit") && t.args?.path) {
      paths.add(String(t.args.path));
    }
  }
  return [...paths].slice(-12);
}

export function TurnReceipt({ progress, onResume }: TurnReceiptProps) {
  const files = collectReceiptFiles(progress);
  const step =
    progress.currentStep != null && progress.totalSteps != null
      ? `Passo ${progress.currentStep}/${progress.totalSteps}`
      : null;
  const fileCount = files.length;
  const showStep = !!step;
  const showFiles = fileCount > 0;
  const showResume = progress.resumable && !!onResume;

  if (!showStep && !showFiles && !showResume && progress.lastFinishOk !== false) {
    return null;
  }

  return (
    <section
      className="lovable-turn-receipt"
      data-testid="turn-receipt"
      aria-label="Recibo da execução"
    >
      {(showStep || progress.lastFinishOk === false) && (
        <header className="lovable-turn-receipt-header">
          {showStep && (
            <span className="lovable-turn-receipt-step" data-testid="turn-receipt-step">
              {step}
            </span>
          )}
          {progress.lastFinishOk === false && !progress.canceled && (
            <span className="lovable-turn-receipt-status">Entrega parcial</span>
          )}
        </header>
      )}

      {showFiles && (
        <ul className="lovable-activity-files" aria-label="Arquivos entregues">
          {files.map((path) => {
            const isWrite = progress.diffs.some((d) => d.path === path && d.op === "write");
            const Icon = isWrite ? FilePlus : FileEdit;
            return (
              <li key={path} className="lovable-file-chip">
                <Icon className="size-3 shrink-0 opacity-70" />
                <span className="truncate max-w-[200px]" title={path}>
                  {fileBase(path)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {showFiles && (
        <p className="lovable-activity-summary">
          {fileCount === 1 ? "1 arquivo alterado" : `${fileCount} arquivos alterados`}
        </p>
      )}

      {showResume && (
        <button
          type="button"
          className="lovable-turn-receipt-resume"
          data-testid="turn-receipt-resume"
          onClick={onResume}
        >
          <RefreshCw className="size-3.5 shrink-0" />
          Continuar execução
        </button>
      )}
    </section>
  );
}