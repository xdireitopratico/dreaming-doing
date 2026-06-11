// /costs — Token Usage & Cost Dashboard
// Lê as últimas 100 runs do agent_runs, agrega tokens/custo, e mostra por dia/modelo.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, DollarSign, Hash, TrendingUp, Cpu, BarChart3, Clock, Zap } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/costs")({
  component: () => (
    <DashboardShell requireAuth activeNav="settings">
      <CostsPage />
    </DashboardShell>
  ),
});

type RunRow = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps: number;
  error: string | null;
  meta: {
    provider?: string;
    model?: string;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
  };
};

function CostsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["agent-runs-costs", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<RunRow[]> => {
      const { data, error } = await supabase
        .from("agent_runs")
        .select("id, started_at, finished_at, status, steps, error, meta")
        .eq("user_id", user!.id)
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const runs = data.filter(
      (r) => r.status === "completed" || r.status === "failed" || r.status === "canceled",
    );
    const totalCost = runs.reduce((acc, r) => acc + (r.meta.costUsd ?? 0), 0);
    const totalInput = runs.reduce((acc, r) => acc + (r.meta.totalInputTokens ?? 0), 0);
    const totalOutput = runs.reduce((acc, r) => acc + (r.meta.totalOutputTokens ?? 0), 0);

    const byModel = new Map<string, { cost: number; tokens: number; runs: number }>();
    for (const r of runs) {
      const model = r.meta.model ?? "unknown";
      const prev = byModel.get(model) ?? { cost: 0, tokens: 0, runs: 0 };
      prev.cost += r.meta.costUsd ?? 0;
      prev.tokens += r.meta.totalTokens ?? 0;
      prev.runs += 1;
      byModel.set(model, prev);
    }
    const topModels = [...byModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const byDay = new Map<string, { cost: number; runs: number }>();
    for (const r of runs) {
      const day = r.started_at.slice(0, 10);
      const prev = byDay.get(day) ?? { cost: 0, runs: 0 };
      prev.cost += r.meta.costUsd ?? 0;
      prev.runs += 1;
      byDay.set(day, prev);
    }
    const last7Days = [...byDay.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7)
      .reverse();

    const avgCostPerRun = runs.length > 0 ? totalCost / runs.length : 0;

    return {
      runs: runs.length,
      totalCost,
      totalInput,
      totalOutput,
      totalTokens: totalInput + totalOutput,
      topModels,
      last7Days,
      avgCostPerRun,
    };
  }, [data]);

  return (
    <div className="px-6 py-8 max-w-[960px] mx-auto">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] mb-6"
      >
        <ArrowLeft className="size-3" />
        PROJETOS
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <DollarSign className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Custos & Tokens</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5">
              Últimas 200 runs · estimativa baseada nos preços de tabela dos provedores
            </p>
          </div>
        </div>
      </motion.div>

      {isLoading && <p className="font-mono text-[10px] text-[var(--text-ghost)]">carregando…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <KpiCard
              icon={DollarSign}
              label="Custo total"
              value={`$${stats.totalCost.toFixed(4)}`}
              accent
            />
            <KpiCard
              icon={Hash}
              label="Tokens totais"
              value={stats.totalTokens.toLocaleString("pt-BR")}
            />
            <KpiCard
              icon={TrendingUp}
              label="Custo médio / run"
              value={`$${stats.avgCostPerRun.toFixed(4)}`}
            />
            <KpiCard icon={Cpu} label="Runs" value={String(stats.runs)} />
          </div>

          <section className="mb-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-3 flex items-center gap-1.5">
              <BarChart3 className="size-3" />
              Top modelos por custo
            </h2>
            {stats.topModels.length === 0 ? (
              <p className="font-mono text-[10px] text-[var(--text-ghost)]">
                Sem dados de modelo ainda. Rode um agente pra popular.
              </p>
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 overflow-hidden">
                <table className="w-full font-mono text-[10px]">
                  <thead className="bg-[var(--surface-2)]/40">
                    <tr>
                      <th className="text-left px-3 py-2 text-[var(--text-dim)]">Modelo</th>
                      <th className="text-right px-3 py-2 text-[var(--text-dim)]">Runs</th>
                      <th className="text-right px-3 py-2 text-[var(--text-dim)]">Tokens</th>
                      <th className="text-right px-3 py-2 text-[var(--text-dim)]">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topModels.map((m) => (
                      <tr key={m.model} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 truncate max-w-[260px]">{m.model}</td>
                        <td className="px-3 py-2 text-right">{m.runs}</td>
                        <td className="px-3 py-2 text-right">{m.tokens.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2 text-right text-[var(--primary)]">
                          ${m.cost.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-3 flex items-center gap-1.5">
              <Clock className="size-3" />
              Últimos 7 dias
            </h2>
            {stats.last7Days.length === 0 ? (
              <p className="font-mono text-[10px] text-[var(--text-ghost)]">Sem dados ainda.</p>
            ) : (
              <DayBarChart
                days={stats.last7Days}
                maxCost={Math.max(...stats.last7Days.map((d) => d[1].cost), 0.001)}
              />
            )}
          </section>

          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-dim)] mb-3 flex items-center gap-1.5">
              <Zap className="size-3" />
              Runs recentes
            </h2>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)]/30 overflow-hidden">
              <table className="w-full font-mono text-[10px]">
                <thead className="bg-[var(--surface-2)]/40">
                  <tr>
                    <th className="text-left px-3 py-2 text-[var(--text-dim)]">Quando</th>
                    <th className="text-left px-3 py-2 text-[var(--text-dim)]">Modelo</th>
                    <th className="text-right px-3 py-2 text-[var(--text-dim)]">Steps</th>
                    <th className="text-right px-3 py-2 text-[var(--text-dim)]">Tokens</th>
                    <th className="text-right px-3 py-2 text-[var(--text-dim)]">Custo</th>
                    <th className="text-right px-3 py-2 text-[var(--text-dim)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.slice(0, 20).map((r) => (
                    <tr key={r.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 text-[var(--text-dim)]">
                        {new Date(r.started_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[200px]">{r.meta.model ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{r.steps}</td>
                      <td className="px-3 py-2 text-right">
                        {(r.meta.totalTokens ?? 0).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--primary)]">
                        ${(r.meta.costUsd ?? 0).toFixed(4)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent
          ? "border-[var(--primary)]/30 bg-[var(--primary)]/5"
          : "border-[var(--border)] bg-[var(--surface-1)]/30"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon
          className={`size-3.5 ${accent ? "text-[var(--primary)]" : "text-[var(--text-dim)]"}`}
        />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-dim)]">
          {label}
        </span>
      </div>
      <p
        className={`font-mono text-lg ${accent ? "text-[var(--primary)]" : "text-[var(--foreground)]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "text-emerald-400",
    failed: "text-rose-400",
    canceled: "text-amber-400",
    running: "text-sky-400",
  };
  return (
    <span className={`uppercase tracking-wider ${colors[status] ?? "text-[var(--text-dim)]"}`}>
      {status}
    </span>
  );
}

function DayBarChart({
  days,
  maxCost,
}: {
  days: Array<[string, { cost: number; runs: number }]>;
  maxCost: number;
}) {
  return (
    <div className="space-y-1.5">
      {days.map(([day, info]) => {
        const pct = maxCost > 0 ? (info.cost / maxCost) * 100 : 0;
        return (
          <div key={day} className="flex items-center gap-2 font-mono text-[10px]">
            <span className="w-20 text-[var(--text-dim)] shrink-0">{day.slice(5)}</span>
            <div className="flex-1 h-5 bg-[var(--surface-2)]/40 rounded relative overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--primary)]/60 to-[var(--primary)] rounded transition-all"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <span className="w-20 text-right text-[var(--text-ghost)]">
              ${info.cost.toFixed(4)}
            </span>
            <span className="w-12 text-right text-[var(--text-ghost)]">{info.runs} run</span>
          </div>
        );
      })}
    </div>
  );
}
