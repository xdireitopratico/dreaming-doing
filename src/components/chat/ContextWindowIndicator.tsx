import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  agentModeLabel,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  loadAgentPreferences,
  saveAgentPreferencesToDb,
  type AgentPreferences,
  type ContextWindowMode,
} from "@/lib/agent-preferences";
import { getPresetById } from "@/lib/model-catalog";
import { postAgentRun } from "@/hooks/agent-run/agent-run-connect";
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
    return `${preset.label} · ${agentModeLabel(raw)}`;
  }, [open]);

  const fillPercent = useMemo(() => {
    if (contextUsage?.compacting || compactPending) return 100;
    const p = contextUsage?.percent;
    if (typeof p === "number" && p >= 0) return Math.min(100, p);
    return 0;
  }, [contextUsage, compactPending]);

  const isCompacting = contextUsage?.compacting === true || compactPending;

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
  }, [activeRunId, running, persistPrefs, prefs.mode, prefs.windowTokens]);

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
        className="w-72 border-[var(--border-forge)] bg-[var(--bg-elevated)] p-3 text-sm"
      >
        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Modelo
            </div>
            <div className="mt-1 truncate font-mono text-[11px] text-[var(--text-secondary)]">
              {modelLabel}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              Compactação
            </div>
            <div className="flex rounded-md border border-[var(--border-forge)] p-0.5">
              {(["auto", "manual"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-xs capitalize transition-colors",
                    prefs.mode === mode
                      ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                  )}
                  onClick={() => {
                    const next = { ...prefs, mode };
                    setPrefs(next);
                    void persistPrefs(next);
                  }}
                >
                  {mode === "auto" ? "Automático" : "Manual"}
                </button>
              ))}
            </div>
            {prefs.mode === "manual" ? (
              <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-muted)]">
                Sem compactação automática. Acima da janela, a qualidade pode cair — sua
                responsabilidade.
              </p>
            ) : (
              <p className="mt-1.5 text-[10px] leading-snug text-[var(--text-muted)]">
                Compacta em ~80% com aviso ao agente; força em ~95% se necessário.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="context-window-tokens"
              className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]"
            >
              Janela (tokens)
            </label>
            <input
              id="context-window-tokens"
              type="text"
              inputMode="numeric"
              className="mt-1 w-full rounded-md border border-[var(--border-forge)] bg-[var(--bg-base)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-active)]"
              placeholder="256000"
              value={prefs.windowTokens}
              onChange={(e) => setPrefs((p) => ({ ...p, windowTokens: e.target.value }))}
              onBlur={() => void persistPrefs(prefs)}
            />
          </div>

          {contextUsage ? (
            <div className="text-[10px] text-[var(--text-muted)]">
              Uso: {contextUsage.usageTokens.toLocaleString()} /{" "}
              {contextUsage.windowTokens.toLocaleString()} tokens (
              {Math.round(contextUsage.percent)}%)
            </div>
          ) : null}

          <button
            type="button"
            className="w-full rounded-md border border-[var(--border-forge)] bg-[var(--bg-hover)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-active)] disabled:opacity-50"
            disabled={saving || isCompacting}
            onClick={() => void handleCompactNow()}
          >
            {isCompacting ? "Compactando…" : "Compactar agora"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}