import { useCallback, useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Copy, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  formatShotForClipboard,
  getTroubleshootingShot,
  subscribeEditorTelemetry,
  type EditorHealth,
  type TelemetrySignal,
} from "@/lib/editor-telemetry";

const HEALTH_STYLES: Record<
  EditorHealth,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  healthy: {
    label: "Saudável",
    className: "text-emerald-600 bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degradado",
    className: "text-amber-700 bg-amber-50 border-amber-200",
    icon: AlertCircle,
  },
  critical: {
    label: "Crítico",
    className: "text-red-700 bg-red-50 border-red-200",
    icon: AlertCircle,
  },
};

function SignalRow({ s }: { s: TelemetrySignal }) {
  const dot =
    s.level === "error"
      ? "bg-red-500"
      : s.level === "warn"
        ? "bg-amber-500"
        : s.level === "ok"
          ? "bg-emerald-500"
          : "bg-neutral-400";
  return (
    <li className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            {s.category}
          </p>
          <p className="text-xs text-neutral-800 leading-snug">{s.message}</p>
          {s.hint && <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">{s.hint}</p>}
        </div>
      </div>
    </li>
  );
}

export function TroubleshootingShotPanel() {
  const [tick, setTick] = useState(0);
  const shot = getTroubleshootingShot();
  const style = HEALTH_STYLES[shot.health];
  const HealthIcon = style.icon;

  useEffect(() => {
    return subscribeEditorTelemetry(() => setTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, []);

  void tick;

  const copyShot = useCallback(async () => {
    const text = formatShotForClipboard(getTroubleshootingShot());
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }, []);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getTroubleshootingShot(), null, 2));
    } catch {
      toast.error("Não foi possível copiar JSON");
    }
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-neutral-50">
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="size-4 text-neutral-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
              Live shot
            </p>
            <p className="text-[10px] text-neutral-400 truncate">
              sessão {shot.sessionId.slice(0, 8)}…
            </p>
          </div>
        </div>
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium shrink-0 ${style.className}`}
        >
          <HealthIcon className="size-3" />
          {style.label} · {shot.score}
        </div>
      </div>

      <div className="flex gap-2 border-b border-neutral-200 bg-white px-3 py-2 shrink-0">
        <button
          type="button"
          onClick={copyShot}
          className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-neutral-800"
        >
          <Copy className="size-3" />
          Copiar relatório
        </button>
        <button
          type="button"
          onClick={copyJson}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-[10px] text-neutral-700 hover:bg-neutral-100"
        >
          <Copy className="size-3" />
          JSON
        </button>
        <button
          type="button"
          onClick={() => setTick((n) => n + 1)}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1.5 text-[10px] text-neutral-600 hover:bg-neutral-100 ml-auto"
          title="Atualizar vista"
        >
          <RefreshCw className="size-3" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        <p className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-800 leading-snug">
          {shot.headline}
        </p>

        {shot.blockers.length > 0 && (
          <section>
            <h3 className="mb-2 text-[9px] font-mono uppercase tracking-[0.2em] text-red-600">
              Bloqueios ({shot.blockers.length})
            </h3>
            <ul className="space-y-2">
              {shot.blockers.map((s) => (
                <SignalRow key={`b-${s.id}`} s={s} />
              ))}
            </ul>
          </section>
        )}

        {shot.warnings.length > 0 && (
          <section>
            <h3 className="mb-2 text-[9px] font-mono uppercase tracking-[0.2em] text-amber-700">
              Avisos ({shot.warnings.length})
            </h3>
            <ul className="space-y-2">
              {shot.warnings.map((s) => (
                <SignalRow key={`w-${s.id}`} s={s} />
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">
            Sinais ({shot.signals.length})
          </h3>
          <ul className="space-y-2">
            {shot.signals.map((s) => (
              <SignalRow key={s.id} s={s} />
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">
            Snapshot
          </h3>
          <pre className="max-h-[200px] overflow-auto rounded-lg border border-neutral-200 bg-white p-2 text-[10px] leading-relaxed text-neutral-700 font-mono">
            {JSON.stringify(shot.snapshot, null, 2)}
          </pre>
        </section>

        <section>
          <h3 className="mb-2 text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">
            Eventos ({shot.recentEvents.length})
          </h3>
          <pre className="max-h-[160px] overflow-auto rounded-lg border border-neutral-200 bg-neutral-900 p-2 text-[10px] leading-relaxed text-neutral-300 font-mono">
            {shot.recentEvents.length === 0
              ? "// aguardando eventos…"
              : shot.recentEvents
                  .slice(-30)
                  .map((e) => {
                    const t = new Date(e.ts).toISOString().slice(11, 19);
                    return `${t} [${e.level}] ${e.category}/${e.action}${e.detail ? ` ${e.detail}` : ""}`;
                  })
                  .join("\n")}
          </pre>
        </section>
      </div>
    </div>
  );
}
