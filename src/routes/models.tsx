import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { AiModelStudio } from "@/components/connectors/AiModelStudio";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/models")({
  component: () => (
    <DashboardShell requireAuth activeNav="models">
      <ModelsPage />
    </DashboardShell>
  ),
});

function ModelsPage() {
  const { user } = useAuth();

  const { data: connectorRows } = useQuery({
    queryKey: ["connectors-public", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connectors_public")
        .select("kind, meta")
        .eq("owner_id", user!.id);
      if (error) throw error;
      return (data ?? []) as { kind: string; meta: Record<string, unknown> | null }[];
    },
  });

  return (
    <div className="px-6 py-8 max-w-[1100px] mx-auto">
      <Link
        to="/api"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] text-[var(--text-ghost)] hover:text-[var(--foreground)] mb-6"
      >
        <ArrowLeft className="size-3" />
        API
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 grid place-items-center">
            <Brain className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <h1 className="font-display text-3xl tracking-tight">Modelos</h1>
            <p className="font-mono text-[10px] text-[var(--text-dim)] mt-0.5">
              Ambiente, preset, modo do agente e voz (STT) — chaves em API
            </p>
          </div>
        </div>
      </motion.div>

      <AiModelStudio connectorRows={connectorRows} keysSectionHref="/api" />
    </div>
  );
}