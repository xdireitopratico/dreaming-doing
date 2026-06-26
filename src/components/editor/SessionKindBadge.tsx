/**
 * SessionKindBadge — discreto diagnostic chip que mostra TASTE ou BYOK
 * que o sistema está lendo agora. Atualiza em tempo real via telemetry.
 * Estilo inspirado no E2bStatusBadge (mesma pegada discreta, monoespaçada).
 */
import { Sparkles, KeyRound } from "lucide-react";
import { useEditorTelemetry } from "@/hooks/useEditorTelemetry";
import { cn } from "@/lib/utils";

export function SessionKindBadge() {
  const { snapshot } = useEditorTelemetry();
  const kind = snapshot.agent.sessionKindResolved;

  if (!kind) return null;

  const isByok = kind === "byok";
  const isTaste = kind.startsWith("taste");

  return (
    <span
      className="forge-e2b-badge inline-flex items-center gap-1.5 rounded-md border border-[var(--forge-border)] px-2 py-1 text-[10px] font-mono text-[var(--forge-muted)]"
      title={`Sistema lendo: ${isByok ? "BYOK (sua config em /api-models)" : "TASTE (pool da plataforma)"}`}
      data-testid="session-kind-badge"
      data-session-kind={kind}
    >
      {isByok ? (
        <KeyRound className="size-3 shrink-0" />
      ) : (
        <Sparkles className="size-3 shrink-0" />
      )}
      <span
        className={cn(
          "size-1.5 rounded-full shrink-0",
          isByok ? "bg-emerald-400" : "bg-amber-400",
        )}
        aria-hidden
      />
      <span className="hidden sm:inline">
        {isByok ? "BYOK" : isTaste ? "TASTE" : kind}
      </span>
    </span>
  );
}
