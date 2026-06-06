// /healthz — Status page pública (sem auth). Mostra resultado do /functions/v1/health
// Atualiza a cada 30s. Mostra cada check (db, auth, llm, e2b, pgmq) com latência e erro.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Activity, Database, KeyRound, Cpu, Server, Layers, RefreshCw } from "lucide-react";
import { getSupabaseEnv } from "@/lib/supabase-env";

type CheckResult = { ok: boolean; latencyMs: number; detail?: string; error?: string };

type HealthReport = {
  ok: boolean;
  version: string;
  buildSha: string;
  projectRef: string;
  timestamp: string;
  checks: {
    db: CheckResult;
    auth: CheckResult;
    llm: { nvidia: CheckResult; groq: CheckResult };
    e2b: CheckResult;
    pgmq: CheckResult;
  };
};

export const Route = createFileRoute("/healthz")({
  component: HealthPage,
  ssr: false,
});

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-full shrink-0 ${
        ok ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-amber-400"
      }`}
    />
  );
}

function CheckRow({
  icon: Icon,
  label,
  result,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  result: CheckResult;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)]/40">
      <Icon className={`size-4 mt-0.5 ${result.ok ? "text-emerald-400" : "text-amber-400"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusDot ok={result.ok} />
          <span className="font-mono text-[11px]">{label}</span>
          <span className="font-mono text-[9px] text-[var(--text-ghost)] ml-auto">
            {result.latencyMs}ms
          </span>
        </div>
        {result.detail && (
          <p className="font-mono text-[9px] text-[var(--text-dim)] mt-0.5 truncate">
            {result.detail}
          </p>
        )}
        {result.error && (
          <p className="font-mono text-[9px] text-amber-400/90 mt-0.5 break-words">
            {result.error}
          </p>
        )}
      </div>
    </div>
  );
}

function HealthPage() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const { url, publishableKey } = getSupabaseEnv();
      if (!url || !publishableKey) {
        setError("Supabase não configurado");
        return;
      }
      const res = await fetch(`${url}/functions/v1/health`, {
        headers: { apikey: publishableKey },
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as HealthReport;
      setReport(data);
      setError(null);
      setLastFetch(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const id = setInterval(() => void fetchHealth(), 30_000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6"
        >
          <div
            className={`size-10 rounded-xl grid place-items-center border ${
              report?.ok
                ? "bg-emerald-400/10 border-emerald-400/30"
                : "bg-amber-400/10 border-amber-400/30"
            }`}
          >
            <Activity className={`size-5 ${report?.ok ? "text-emerald-400" : "text-amber-400"}`} />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl tracking-tight">FORGE Status</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)]">
              {report
                ? `${report.version} · ${report.buildSha.slice(0, 7)} · ${report.projectRef || "—"}`
                : "carregando…"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchHealth()}
            disabled={loading}
            className="grid size-9 place-items-center rounded-lg border border-[var(--border)] hover:border-[var(--primary)]/40 disabled:opacity-50"
            aria-label="Atualizar"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </motion.div>

        {error && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 mb-4">
            <p className="font-mono text-[11px] text-amber-400">Erro: {error}</p>
          </div>
        )}

        {report && (
          <>
            <div
              className={`rounded-lg border p-4 mb-4 ${
                report.ok
                  ? "border-emerald-400/30 bg-emerald-400/5"
                  : "border-amber-400/30 bg-amber-400/5"
              }`}
            >
              <p className="font-mono text-[12px]">
                {report.ok
                  ? "✓ Todos os serviços críticos operacionais"
                  : "✗ Um ou mais serviços críticos com problema"}
              </p>
              <p className="font-mono text-[9px] text-[var(--text-dim)] mt-1">
                Última checagem: {new Date(report.timestamp).toLocaleString("pt-BR")} · auto-refresh 30s
              </p>
            </div>

            <section className="mb-4">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-2">
                Crítico
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckRow icon={Database} label="DB (profiles)" result={report.checks.db} />
                <CheckRow icon={KeyRound} label="Auth" result={report.checks.auth} />
              </div>
            </section>

            <section className="mb-4">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-2">
                LLM Providers
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckRow icon={Cpu} label="NVIDIA" result={report.checks.llm.nvidia} />
                <CheckRow icon={Cpu} label="Groq" result={report.checks.llm.groq} />
              </div>
            </section>

            <section className="mb-4">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-2">
                Infraestrutura
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckRow icon={Server} label="E2B" result={report.checks.e2b} />
                <CheckRow icon={Layers} label="PGMQ" result={report.checks.pgmq} />
              </div>
            </section>

            <p className="font-mono text-[9px] text-[var(--text-ghost)] text-center mt-6">
              {lastFetch > 0 && `fetched ${new Date(lastFetch).toLocaleTimeString("pt-BR")} · `}
              <a
                href={`${getSupabaseEnv().url}/functions/v1/health`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                JSON raw ↗
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
