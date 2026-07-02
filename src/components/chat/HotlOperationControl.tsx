import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  loadAgentPreferences,
  saveAgentPreferencesToDb,
  type AgentPreferences,
  type OperationPrefs,
} from "@/lib/agent-preferences";
import { COOPERATIVE_WALL_MS, HOTL_WALL_MS } from "@/lib/agent-operation-contract";

const WALL_OPTIONS = [24, 48, 72] as const;

function readOperationPrefs(prefs: AgentPreferences): OperationPrefs {
  return prefs.operation ?? { mode: "cooperative" };
}

type HotlOperationControlProps = {
  layout?: "stack" | "inline";
  className?: string;
  onUpdated?: (prefs: OperationPrefs) => void;
};

export function HotlOperationControl({
  layout = "stack",
  className,
  onUpdated,
}: HotlOperationControlProps) {
  const [operation, setOperation] = useState(() => readOperationPrefs(loadAgentPreferences()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOperation(readOperationPrefs(loadAgentPreferences()));
  }, []);

  const persist = useCallback(async (next: OperationPrefs) => {
    const current = loadAgentPreferences();
    setSaving(true);
    try {
      await saveAgentPreferencesToDb({ ...current, operation: next });
      setOperation(next);
      onUpdated?.(next);
    } finally {
      setSaving(false);
    }
  }, []);

  const isHotl = operation.mode === "hotl";
  const wallHours = operation.hotlWallHours ?? 24;

  return (
    <div className={cn("grid gap-[3px]", layout === "inline" && "gap-2", className)}>
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border border-[rgba(237,239,242,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-1",
          layout === "inline" && "px-2 py-1.5",
        )}
      >
        <div className="min-w-0">
          <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
            Human on the Loop
          </p>
          <p className="text-[7px] text-[var(--text-muted)]">
            {isHotl ? "Entrega com report no chat" : "Cooperative · 60 min"}
          </p>
        </div>
        <Switch
          checked={isHotl}
          disabled={saving}
          aria-label="Human on the Loop"
          title={isHotl ? "HOTL ativo" : "Cooperative (60 min)"}
          onCheckedChange={(checked) => {
            const next: OperationPrefs = checked
              ? { mode: "hotl", hotlWallHours: wallHours }
              : { mode: "cooperative" };
            void persist(next);
          }}
          className={cn(
            "h-[14px] w-[28px] shrink-0 border border-[var(--border-forge)] shadow-none",
            "data-[state=checked]:bg-[var(--text-accent)] data-[state=unchecked]:bg-[var(--bg-hover)]",
            "data-[state=checked]:border-transparent data-[state=unchecked]:border-[var(--border-forge)]",
          )}
        />
      </div>

      {isHotl && (
        <div className="grid grid-cols-3 gap-1">
          {WALL_OPTIONS.map((hours) => (
            <button
              key={hours}
              type="button"
              disabled={saving}
              className={cn(
                "rounded-md border px-1 py-[3px] text-center font-mono text-[8px] tabular-nums transition-colors",
                wallHours === hours
                  ? "border-[var(--text-accent)] bg-[var(--text-accent)]/15 text-[var(--text-accent)]"
                  : "border-[var(--border-forge)] text-[var(--text-secondary)] hover:border-[var(--border-active)]",
              )}
              onClick={() => void persist({ mode: "hotl", hotlWallHours: hours })}
            >
              {hours}h
            </button>
          ))}
        </div>
      )}

      {layout === "stack" && (
        <p className="px-0.5 text-[7px] leading-snug text-[var(--text-muted)]">
          {isHotl
            ? `Wall ${Math.round(HOTL_WALL_MS[wallHours] / 3_600_000)}h · report ao sair`
            : `Wall ${Math.round(COOPERATIVE_WALL_MS / 60_000)} min · continuar só emergência`}
        </p>
      )}
    </div>
  );
}

