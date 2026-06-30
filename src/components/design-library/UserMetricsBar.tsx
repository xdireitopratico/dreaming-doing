import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, CheckCircle, FolderOpen, Briefcase, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UserMetrics {
  jobCount: number;
  entryCount: number;
  avgQuality: number;
  validatedCount: number;
  recentJobs: Array<{
    id: string;
    status: string;
    categories: string[] | null;
    created_at: string;
    finished_at: string | null;
    error: string | null;
  }>;
}

const EMPTY_METRICS: UserMetrics = {
  jobCount: 0,
  entryCount: 0,
  avgQuality: 0,
  validatedCount: 0,
  recentJobs: [],
};

export function UserMetricsBar() {
  const [metrics, setMetrics] = useState<UserMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMetrics() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("design_library_user_metrics");
        if (!cancelled && !error && data) {
          setMetrics(data as unknown as UserMetrics);
        }
      } catch (err) {
        console.warn("[UserMetricsBar] failed to load:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-1">
        <BarChart3 className="size-4 text-muted-foreground animate-pulse" />
        <span className="text-[11px] text-muted-foreground">Carregando métricas...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-surface-1 overflow-x-auto">
      <div className="flex items-center gap-1.5 shrink-0">
        <BarChart3 className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground">Minhas Métricas</span>
      </div>

      <MetricBadge
        icon={<Briefcase className="size-3" />}
        label="Jobs"
        value={String(metrics.jobCount)}
        color="text-blue-500"
      />

      <MetricBadge
        icon={<FolderOpen className="size-3" />}
        label="Entradas"
        value={String(metrics.entryCount)}
        color="text-green-500"
      />

      <MetricBadge
        icon={<Star className="size-3" />}
        label="Qualidade"
        value={metrics.avgQuality > 0 ? metrics.avgQuality.toFixed(1) : "—"}
        color="text-amber-500"
      />

      <MetricBadge
        icon={<CheckCircle className="size-3" />}
        label="Validadas"
        value={String(metrics.validatedCount)}
        color="text-purple-500"
      />

      {/* Recent jobs summary */}
      {metrics.recentJobs.length > 0 && (
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <TrendingUp className="size-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Últimos:</span>
          {metrics.recentJobs.slice(0, 3).map((j) => (
            <Badge
              key={j.id}
              variant="outline"
              className={`text-[9px] px-1.5 py-0 ${
                j.status === "completed"
                  ? "border-green-500/30 text-green-500"
                  : j.status === "failed"
                    ? "border-red-500/30 text-red-500"
                    : j.status === "running"
                      ? "border-yellow-500/30 text-yellow-500 animate-pulse"
                      : "border-border text-muted-foreground"
              }`}
            >
              {j.status}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBadge({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <span className={color}>{icon}</span>
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <span className={`text-[11px] font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
