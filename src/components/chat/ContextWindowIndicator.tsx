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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ContextUsage = {
  usageTokens: number;
  windowTokens: number;
  percent: number;
  mode: ContextWindowMode;
  compacting: boolean;
} | null | undefined;

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

export function ContextWindowIndicator({
  contextUsage,
  activeRunId,
  running = false,
}: ContextWindowIndicatorProps) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => readContextPrefs(loadAgentPreferences()));
  const [saving, setSaving] = useState(false);
  const [compactPending, setCompactPending] = useState(false);

  useEffect(() => {
    setPrefs(readContextPrefs(loadAgentPreferences()));
  }, [open]);

  const modelLabel = useMemo(() => {
    const raw = loadAgentPreferences();
    const preset = getPresetById(
      raw.mode === "robin" ? raw.robinPoolModelId : raw.fixedPresetId,
      raw.userModelEntries,
    );
    return preset.label;
  }, [open]);

  const fillPercent = useMemo(() => {
    if (contextUsage?.compacting || compactPending) return 100;
    const p = contextUsage?.percent;
    if (typeof p === "number" && p >= 0) return Math.min(100, p);
    return 0;
  }, [contextUsage, compactPending]);

  const isCompacting = contextUsage?.compacting === true || compactPending;
  const percentLabel = contextUsage || isCompacting ? `${Math.round(fillPercent)}%` : "—";

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
        className="w-[192px] border border-[var(--border-forge)]/70 bg-transparent p-0 shadow-none"
      >
        <div className="rounded-[14px] border border-[var(--forge-border-strong,rgba(237,239,242,0.14))] bg-[linear-gradient(135deg,#1a1e27,#0b0d12)] p-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.42),0_0_0_1px_rgba(255,182,39,0.04)_inset] backdrop-blur-[22px] backdrop-saturate-[140%]">
          <div className="grid gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1">
              <div className="min-w-0">
                <label
                  htmlFor="context-window-tokens"
                  className="mb-0.5 block text-[8px] uppercase tracking-[0.16em] text-[var(--text-muted)]"
                >
                  tokens
                </label>
                <input
                  id="context-window-tokens"
                  type="text"
                  inputMode="numeric"
                  className="h-7 w-full rounded-md border border-[var(--border-forge)] bg-[var(--bg-base)] px-2 font-mono text-[10px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-active)]"
                  placeholder="128000"
                  value={prefs.windowTokens}
                  onChange={(e) => setPrefs((p) => ({ ...p, windowTokens: e.target.value }))}
                  onBlur={() => void persistPrefs(prefs)}
                />
              </div>

              <div className="pb-0.5">
                <Switch
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
                    "h-[15px] w-[27px] border border-[var(--border-forge)] shadow-none",
                    "data-[state=checked]:bg-[var(--text-accent)] data-[state=unchecked]:bg-[var(--bg-hover)]",
                    "data-[state=checked]:border-transparent data-[state=unchecked]:border-[var(--border-forge)]",
                  )}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-[rgba(237,239,242,0.08)] bg-[rgba(255,255,255,0.03)] px-1.5 py-1">
              <Brain className="size-2.5 shrink-0 text-[var(--text-accent)]" aria-hidden />
              <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg-hover)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fillPercent}%`,
                    background:
                      "linear-gradient(90deg, var(--text-accent), color-mix(in srgb, var(--text-accent) 58%, white))",
                  }}
                />
              </div>
              <span className="min-w-7 text-right font-mono text-[9px] tabular-nums text-[var(--text-secondary)]">
                {percentLabel}
              </span>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
              <div
                className="min-w-0 truncate font-mono text-[9px] text-[var(--text-secondary)]"
                title={modelLabel}
              >
                {modelLabel}
              </div>

              <button
                type="button"
                className="forge-composer-send min-w-[70px] px-2 text-[9px] font-semibold"
                style={{ width: "auto", height: "22px", paddingInline: "8px", borderRadius: "8px" }}
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
