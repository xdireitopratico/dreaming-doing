import { CheckCircle2, CircleDashed } from "lucide-react";
import type { ConnectorId } from "@/lib/connectors/integration-prefs";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";

/** Status binário: conectado com credencial do usuário ou pendente. */
export function ConnectorAuthStatus({
  id,
  connected,
  label,
}: {
  id: ConnectorId;
  connected: boolean;
  label?: string;
}) {
  const name = CONNECTOR_REGISTRY[id].name;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {connected ? (
        <span className="inline-flex items-center gap-1 font-mono text-[8px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-400/10">
          <CheckCircle2 className="size-3" />
          Autenticado
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-mono text-[8px] text-amber-400/90 px-1.5 py-0.5 rounded bg-amber-400/10">
          <CircleDashed className="size-3" />
          Não configurado
        </span>
      )}
      {label && (
        <span className="font-mono text-[8px] text-[var(--text-dim)] truncate max-w-[180px]">
          {label}
        </span>
      )}
      {!connected && (
        <span className="font-mono text-[8px] text-[var(--text-ghost)]">
          Conecte sua conta {name}
        </span>
      )}
    </div>
  );
}
