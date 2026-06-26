/**
 * SessionKindBadge — discreto diagnostic chip que mostra TASTE/BYOK + contadores.
 * Aparece na página /api-models para o usuário saber qual estado está ativo.
 *
 * - TASTE (verde) com contadores "50/1" quando user sem config, TASTE ativo
 * - BYOK (verde) quando user configurou em /api-models
 * - nada quando estado vazio (não renderiza)
 */
import { Sparkles, KeyRound } from "lucide-react";
import { useEditorTelemetrySnapshot } from "@/lib/editor-telemetry";
import { useConnectors } from "@/hooks/useConnectors";
import { cn } from "@/lib/utils";

export function SessionKindBadge() {
  const snapshot = useEditorTelemetrySnapshot();
  const { tasteChatRemaining, tasteStartRemaining } = useConnectors();
  const kind = snapshot.agent.sessionKindResolved;

  if (!kind) return null;

  const isByok = kind === "byok";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 font-mono text-[10px] text-emerald-400"
      title={
        isByok
          ? "Sistema lendo: BYOK (sua config em /api-models)"
          : "Sistema lendo: TASTE (pool da plataforma)"
      }
      data-testid="session-kind-badge"
      data-session-kind={kind}
    >
      {isByok ? <KeyRound className="size-3 shrink-0" /> : <Sparkles className="size-3 shrink-0" />}
      <span
        className={cn(
          "size-1.5 rounded-full shrink-0",
          isByok ? "bg-emerald-400" : "bg-emerald-400",
        )}
        aria-hidden
      />
      <span>{isByok ? "BYOK" : `TASTE ${tasteChatRemaining}/${tasteStartRemaining}`}</span>
    </span>
  );
}
