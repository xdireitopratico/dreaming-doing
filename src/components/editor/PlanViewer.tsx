import { ListTodo } from "lucide-react";
import type { PendingPlan } from "@/lib/agent-progress";

interface PlanViewerProps {
  plan: PendingPlan;
  onOpen: () => void;
}

/** Atalho no chat para reabrir o Plan view (modal único no layout). */
export function PlanViewer({ plan, onOpen }: PlanViewerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--primary)]/35 bg-[var(--primary)]/8 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--primary)]/15 transition-colors"
      aria-label="Abrir plano completo"
    >
      <ListTodo className="size-4 text-[var(--primary)] shrink-0" />
      <span>Ver plano completo</span>
      <span className="text-xs text-[var(--forge-silver)]">({plan.steps.filter((s) => s.enabled).length} tarefas)</span>
    </button>
  );
}