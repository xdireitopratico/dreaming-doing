import { Flame } from "lucide-react";
import type { ConnectorId, IntegrationMode } from "@/lib/connectors/integration-prefs";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";

export function ConnectorModeToggle({
  id,
  mode,
  forgeAvailable,
  onModeChange,
}: {
  id: ConnectorId;
  mode: IntegrationMode;
  forgeAvailable: boolean;
  onModeChange: (mode: IntegrationMode) => void;
}) {
  const name = CONNECTOR_REGISTRY[id].name;

  return (
    <div className="flex gap-1 mt-3 p-0.5 rounded-md bg-[var(--surface-2)]/80 border border-[var(--border)] w-fit">
      <button
        type="button"
        onClick={() => onModeChange("forge")}
        disabled={!forgeAvailable}
        className={`px-2.5 py-1 rounded font-mono text-[8px] transition-colors ${
          mode === "forge"
            ? "bg-[var(--primary)]/15 text-[var(--primary)]"
            : "text-[var(--text-ghost)] hover:text-[var(--foreground)]"
        } ${!forgeAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
      >
        <span className="inline-flex items-center gap-1">
          <Flame className="size-2.5" />
          FORGE
        </span>
      </button>
      <button
        type="button"
        onClick={() => onModeChange("own")}
        className={`px-2.5 py-1 rounded font-mono text-[8px] transition-colors ${
          mode === "own"
            ? "bg-[var(--primary)]/15 text-[var(--primary)]"
            : "text-[var(--text-ghost)] hover:text-[var(--foreground)]"
        }`}
      >
        Meu {name}
      </button>
    </div>
  );
}
