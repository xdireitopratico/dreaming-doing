import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  loadAgentPreferences,
  saveAgentPreferencesToDb,
  type AgentPreferences,
  type ContextWindowMode,
} from "@/lib/agent-preferences";
import { getPresetById } from "@/lib/model-catalog";
import { postAgentRun } from "@/hooks/agent-run/agent-run-connect";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ContextUsage =
  | {
      usageTokens: number;
      windowTokens: number;
      percent: number;
      mode: ContextWindowMode;
      compacting: boolean;
    }
  | null
  | undefined;

type ContextWindowIndicatorProps = {
  contextUsage?: ContextUsage;
  activeRunId?: string | null;
  running?: boolean;
};

function readContextPrefs(prefs: AgentPreferences) {
  return {
    mode: prefs.contextWindow?.mode ?? "manual",
    windowTokens: String(prefs.contextWindow?.windowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS),
  };
}

function formatTokenCount(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (value < 1000) return `${value}`;
  if (value < 1_000_000) {
    const rounded = Math.round(value / 100) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return `${Math.round(value / 1_000_000)}M`;
}

export function ContextWindowIndicator({
  contextUsage,
  activeRunId,
  running = false,
}: ContextWindowIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => readContextPrefs(loadAgentPreferences()));
  const [saving, setSaving] = useState(false);
  const [compactPending, setCompactPending] = useState(false);
  const [lastKnownPercent, setLastKnownPercent] = useState(0);

  useEffect(() => {
    setPrefs(readContextPrefs(loadAgentPreferences()));
  }, [open]);

  const rawPrefs = loadAgentPreferences();
  const modelLabel = getPresetById(
    rawPrefs.mode === "robin" ? rawPrefs.robinPoolModelId : rawPrefs.fixedPresetId,
    rawPrefs.userModelEntries,
  ).label;
  const usagePercent = contextUsage?.percent;
  const usageTokens = contextUsage?.usageTokens;
  const windowTokens = contextUsage?.windowTokens;
  const isServerCompacting = contextUsage?.compacting === true;

  const fillPercent = useMemo(() => {
    if (isServerCompacting || compactPending) return 100;
    const p = usagePercent;
    if (typeof p === "number" && p >= 0) return Math.min(100, p);
    return lastKnownPercent;
  }, [compactPending, isServerCompacting, lastKnownPercent, usagePercent]);

  useEffect(() => {
    const p = usagePercent;
    if (typeof p === "number" && p >= 0) {
      setLastKnownPercent(Math.min(100, p));
    }
  }, [usagePercent]);

  const isCompacting = contextUsage?.compacting === true || compactPending;
  const percentLabel = contextUsage || isCompacting ? `${Math.round(fillPercent)}%` : "—";
  const usageLabel =
    typeof usageTokens === "number" && typeof windowTokens === "number"
      ? `${formatTokenCount(usageTokens)} / ${formatTokenCount(windowTokens)}`
      : "—";

  const persistPrefs = useCallback(
    async (next: { mode: ContextWindowMode; windowTokens: string }) => {
      const tokens = parseInt(next.windowTokens.replace(/\D/g, ""), 10);
      const current = loadAgentPreferences();
      const merged: AgentPreferences = {
        ...current,
        contextWindow: {
          mode: next.mode,
          windowTokens:
            Number.isFinite(tokens) && tokens > 0 ? tokens : DEFAULT_CONTEXT_WINDOW_TOKENS,
        },
      };
      setSaving(true);
      try {
        await saveAgentPreferencesToDb(merged);
        setPrefs(next);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const handleCompactNow = useCallback(async () => {
    const tokens = parseInt(prefs.windowTokens.replace(/\D/g, ""), 10);
    await persistPrefs({
      mode: prefs.mode,
      windowTokens: String(
        Number.isFinite(tokens) && tokens > 0 ? tokens : DEFAULT_CONTEXT_WINDOW_TOKENS,
      ),
    });
    if (activeRunId && running) {
      setCompactPending(true);
      try {
        await postAgentRun({ action: "request_compact", runId: activeRunId });
      } finally {
        setCompactPending(false);
      }
    }
    setOpen(false);
  }, [activeRunId, persistPrefs, prefs.mode, prefs.windowTokens, running]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="forge-composer-context-window"
          aria-label="Janela de contexto"
          title="Janela de contexto"
        >
          {isCompacting ? (
            <Loader2 className="forge-composer-context-window-spinner size-3.5" />
          ) : (
            <span className="forge-composer-context-window-dot" aria-hidden>
              <svg viewBox="0 0 16 16" className="size-3.5">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  opacity="0.35"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray={`${(fillPercent / 100) * 37.7} 37.7`}
                  transform="rotate(-90 8 8)"
                />
              </svg>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[152px] border border-[var(--border-forge)]/70 bg-transparent p-0 shadow-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="rounded-[11px] border border-[var(--forge-border-strong,rgba(237,239,242,0.14))] bg-[linear-gradient(135deg,#1a1e27,#0b0d12)] p-1 shadow-[0_12px_30px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,182,39,0.04)_inset] backdrop-blur-[18px] backdrop-saturate-[140%]">
          <div className="grid gap-[3px]">
            <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)] gap-1">
              <div className="min-w-0">
                <label
                  htmlFor="context-window-tokens"
                  className="mb-0.5 block text-[7px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
                >
                  tokens
                </label>
                <input
                  id="context-window-tokens"
                  type="text"
                  inputMode="numeric"
                  className="h-[22px] w-full rounded-md border border-[var(--border-forge)] bg-[var(--bg-base)] px-1.5 font-mono text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-active)]"
                  placeholder="128000"
                  value={prefs.windowTokens}
                  onChange={(e) => setPrefs((p) => ({ ...p, windowTokens: e.target.value }))}
                  onBlur={() => void persistPrefs(prefs)}
                />
              </div>

              <div className="min-w-0">
                <label
                  htmlFor="context-window-mode"
                  className="mb-0.5 block text-[7px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
                >
                  mode
                </label>
                <div className="pt-[1px]">
                  <Switch
                    id="context-window-mode"
                    checked={prefs.mode === "auto"}
                    disabled={saving}
                    aria-label={prefs.mode === "auto" ? "Automático" : "Manual"}
                    title={prefs.mode === "auto" ? "Automático" : "Manual"}
                    onCheckedChange={(checked) => {
                      const next: { mode: ContextWindowMode; windowTokens: string } = {
                        ...prefs,
                        mode: checked ? "auto" : "manual",
                      };
                      setPrefs(next);
                      void persistPrefs(next);
                    }}
                    className={cn(
                      "h-[14px] w-[28px] border border-[var(--border-forge)] shadow-none",
                      "data-[state=checked]:bg-[var(--text-accent)] data-[state=unchecked]:bg-[var(--bg-hover)]",
                      "data-[state=checked]:border-transparent data-[state=unchecked]:border-[var(--border-forge)]",
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-1 rounded-md border border-[rgba(237,239,242,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-[2px]">
              <Brain className="size-2.5 shrink-0 text-[var(--text-accent)]" aria-hidden />
              <span className="min-w-0 whitespace-nowrap font-mono text-[8px] tabular-nums text-[var(--text-secondary)]">
                {usageLabel}
              </span>
              <div className="h-[5px] min-w-0 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fillPercent}%`,
                    background: "linear-gradient(90deg, #facc15, #f59e0b)",
                  }}
                />
              </div>
              <span className="min-w-7 text-right font-mono text-[9px] tabular-nums text-[#facc15]">
                {percentLabel}
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
              <div
                className="min-w-0 truncate font-mono text-[8px] text-[var(--text-secondary)]"
                title={modelLabel}
              >
                {modelLabel}
              </div>

              <button
                type="button"
                className="forge-composer-send min-w-[64px] px-1.5 text-[8px] font-semibold"
                style={{ width: "auto", height: "22px", paddingInline: "7px", borderRadius: "7px" }}
                disabled={saving || isCompacting}
                onClick={() => void handleCompactNow()}
              >
                {isCompacting ? "Compactando…" : "Compactar agora"}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
